import type { TacticalCluster } from '@cs2dak/tactics';
import type { DataTableColumn } from '@cs2dak/react';

type EvidenceRow = TacticalCluster['rounds'][number];
/** One set of sort accessors for the evidence table and its exported rows. */
export const patternEvidenceSortColumns: DataTableColumn<EvidenceRow>[] = [
  {
    key: 'match',
    label: '比赛',
    sortable: true,
    sortValue: (row) => row.matchId,
  },
  {
    key: 'round',
    label: '回合',
    sortable: true,
    sortValue: (row) => row.roundNumber,
  },
  {
    key: 'economy',
    label: '经济',
    sortable: true,
    sortValue: (row) => row.economy,
  },
  {
    key: 'result',
    label: '结果',
    sortable: true,
    sortValue: (row) => Number(row.won),
  },
];
