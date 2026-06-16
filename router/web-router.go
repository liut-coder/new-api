package router

import (
	"embed"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	dcOAuthBridgeURL := strings.TrimSpace(os.Getenv("DC_OAUTH_BRIDGE_URL"))
	if dcOAuthBridgeURL != "" {
		dcOAuthBridgeTarget, err := url.Parse(dcOAuthBridgeURL)
		if err != nil {
			common.SysError("invalid DC_OAUTH_BRIDGE_URL: " + err.Error())
		} else {
			dcOAuthBridgeProxy := httputil.NewSingleHostReverseProxy(dcOAuthBridgeTarget)
			dcOAuthBridgeProxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
				common.SysError("dc-oauth bridge proxy failed: " + err.Error())
				http.Error(rw, "dc-oauth bridge unavailable", http.StatusBadGateway)
			}
			router.Any("/dc-oauth/*path", func(c *gin.Context) {
				c.Set(middleware.RouteTagKey, "dc-oauth")
				dcOAuthBridgeProxy.ServeHTTP(c.Writer, c.Request)
			})
		}
	}
	router.Use(static.Serve("/", themeFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}
