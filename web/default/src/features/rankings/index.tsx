/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { useRankings } from './hooks/use-rankings'
import type { UsageRankingRow } from './types'

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return Math.round(value).toLocaleString()
}

function displayName(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

export function Rankings() {
  const { t } = useTranslation()
  const rankingsQuery = useRankings('today')
  const snapshot = rankingsQuery.data?.data

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto w-full max-w-[1180px] space-y-6 px-3 pt-16 pb-10 sm:px-6 sm:pt-20 sm:pb-12 xl:px-8'>
        <section className='space-y-2'>
          <h1 className='text-2xl leading-tight font-semibold sm:text-3xl'>
            {t('今日使用排行榜')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t('查看今日按用户和 API 令牌统计的使用排行榜。')}
          </p>
        </section>

        {rankingsQuery.isLoading ? (
          <RankingsLoading />
        ) : !snapshot ? (
          <RankingsError
            message={
              rankingsQuery.error instanceof Error
                ? rankingsQuery.error.message
                : t('Unable to load rankings data')
            }
          />
        ) : (
          <>
            <section className='grid gap-3 md:grid-cols-3'>
              <MetricCard
                label={t('输入 tokens')}
                value={formatNumber(snapshot.summary.prompt_tokens)}
              />
              <MetricCard
                label={t('输出 tokens')}
                value={formatNumber(snapshot.summary.completion_tokens)}
              />
              <MetricCard
                label={t('总 Token')}
                value={formatNumber(snapshot.summary.total_tokens)}
              />
            </section>

            <section className='bg-card rounded-lg border'>
              <div className='border-b px-4 py-3'>
                <h2 className='text-base font-semibold'>{t('排行榜')}</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {t('按用户和 API 令牌统计的今日使用情况。')}
                </p>
              </div>
              <UsageRankingTable rows={snapshot.rows} />
            </section>
          </>
        )}
      </PageTransition>
    </PublicLayout>
  )
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className='bg-card rounded-lg border px-4 py-4'>
      <p className='text-muted-foreground text-sm'>{props.label}</p>
      <p className='mt-2 text-2xl font-semibold tabular-nums'>{props.value}</p>
    </div>
  )
}

function UsageRankingTable(props: { rows: UsageRankingRow[] }) {
  const { t } = useTranslation()

  if (props.rows.length === 0) {
    return (
      <div className='text-muted-foreground px-4 py-10 text-center text-sm'>
        {t('暂无请求数据')}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-16'>{t('排名')}</TableHead>
          <TableHead>{t('用户名')}</TableHead>
          <TableHead>{t('API 令牌')}</TableHead>
          <TableHead className='text-right'>{t('请求数')}</TableHead>
          <TableHead className='text-right'>{t('输入 tokens')}</TableHead>
          <TableHead className='text-right'>{t('输出 tokens')}</TableHead>
          <TableHead className='text-right'>{t('总 Token')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row) => (
          <TableRow key={`${row.user_id}-${row.token_id}-${row.rank}`}>
            <TableCell className='font-medium'>{row.rank}</TableCell>
            <TableCell>
              {displayName(row.username, `#${row.user_id}`)}
            </TableCell>
            <TableCell>
              {displayName(row.token_name, `#${row.token_id}`)}
            </TableCell>
            <TableCell className='text-right'>
              {formatNumber(row.request_count)}
            </TableCell>
            <TableCell className='text-right'>
              {formatNumber(row.prompt_tokens)}
            </TableCell>
            <TableCell className='text-right'>
              {formatNumber(row.completion_tokens)}
            </TableCell>
            <TableCell className='text-right font-medium'>
              {formatNumber(row.total_tokens)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RankingsLoading() {
  return (
    <div className='space-y-4'>
      <div className='grid gap-3 md:grid-cols-3'>
        <Skeleton className='h-28 w-full rounded-lg' />
        <Skeleton className='h-28 w-full rounded-lg' />
        <Skeleton className='h-28 w-full rounded-lg' />
      </div>
      <Skeleton className='h-[420px] w-full rounded-lg' />
    </div>
  )
}

function RankingsError(props: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className='bg-card rounded-lg border border-dashed px-6 py-12 text-center'>
      <h2 className='text-foreground text-base font-semibold'>
        {t('Unable to load rankings')}
      </h2>
      <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm'>
        {props.message}
      </p>
    </div>
  )
}
