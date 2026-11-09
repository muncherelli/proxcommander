import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { errorMessage } from '@/lib/errors';
import { formatBytes, formatPercent } from '@/lib/format';
import type { ClusterResource, ClusterResourceType } from '@/proxmox/types';
import { useClusterResources, useClusterStatus } from '@/query/hooks';
import { useSession } from '@/session/sessions';
import { useProfiles } from '@/state/profiles';

const GROUPS: Array<{ title: string; type: ClusterResourceType }> = [
  { title: 'Nodes', type: 'node' },
  { title: 'Virtual machines', type: 'qemu' },
  { title: 'Containers', type: 'lxc' },
  { title: 'Storage', type: 'storage' },
];

interface ClusterScreenProps {
  loginId: string;
  onBack: () => void;
}

export function ClusterScreen({ loginId, onBack }: ClusterScreenProps) {
  const session = useSession(loginId);
  const cluster = useProfiles((state) => state.clusters.find((candidate) => candidate.id === session?.clusterId));
  const status = useClusterStatus(loginId);
  const resources = useClusterResources(loginId);

  const endpoint = cluster?.endpoints.find((candidate) => candidate.id === session?.endpointId);
  const summary = status.data?.find((entry) => entry.type === 'cluster');
  const refreshing = status.isRefetching || resources.isRefetching;
  const refresh = () => {
    void status.refetch();
    void resources.refetch();
  };

  return (
    <View className="flex-1">
      <View className="border-border flex-row items-center gap-2 border-b px-2 py-2">
        <Button variant="ghost" size="icon" accessibilityLabel="Back" onPress={onBack}>
          <Icon as={ChevronLeft} />
        </Button>
        <View className="flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {cluster?.name ?? 'Cluster'}
          </Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {session ? `${session.userId} via ${endpoint?.url.replace(/^https:\/\//, '') ?? '—'}` : 'Signed out'}
          </Text>
        </View>
        {summary ? (
          <Badge variant={summary.quorate ? 'default' : 'destructive'}>
            <Text>{summary.quorate ? 'Quorate' : 'No quorum'}</Text>
          </Badge>
        ) : null}
        <Button variant="ghost" size="icon" accessibilityLabel="Refresh" onPress={refresh} disabled={!session}>
          <Icon as={RefreshCw} className="size-4" />
        </Button>
      </View>

      {!session ? (
        <View className="items-center gap-3 py-16">
          <Text>This login is signed out.</Text>
          <Button variant="outline" onPress={onBack}>
            <Text>Back to clusters</Text>
          </Button>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 p-4"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          {resources.error ? <Text className="text-destructive text-sm">{errorMessage(resources.error)}</Text> : null}
          {resources.isPending
            ? [0, 1, 2].map((key) => <Skeleton key={key} className="h-24 w-full" />)
            : GROUPS.map(({ title, type }) => (
                <ResourceGroup
                  key={type}
                  title={title}
                  rows={(resources.data ?? []).filter((row) => row.type === type && !row.template)}
                />
              ))}
        </ScrollView>
      )}
    </View>
  );
}

function ResourceGroup({ title, rows }: { title: string; rows: ClusterResource[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0) || label(a).localeCompare(label(b)));
  return (
    <Card className="gap-0 py-0">
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-sm font-semibold">{title}</Text>
        <Text className="text-muted-foreground text-xs">
          {rows.length}
        </Text>
      </View>
      {sorted.map((row) => (
        <View key={row.id}>
          <Separator />
          <ResourceRow row={row} />
        </View>
      ))}
    </Card>
  );
}

function label(row: ClusterResource): string {
  if (row.type === 'storage') return row.storage ?? row.id;
  if (row.type === 'node') return row.node ?? row.id;
  return row.name ?? row.id;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  running: 'default',
  online: 'default',
  available: 'default',
  stopped: 'secondary',
  offline: 'destructive',
  paused: 'outline',
};

function ResourceRow({ row }: { row: ClusterResource }) {
  const usage =
    row.type === 'storage'
      ? `${formatBytes(row.disk)} / ${formatBytes(row.maxdisk)}`
      : `CPU ${formatPercent(row.cpu)} · ${formatBytes(row.mem)} / ${formatBytes(row.maxmem)}`;
  return (
    <View className="flex-row items-center gap-3 px-4 py-2">
      {row.vmid != null ? (
        <Text className="text-muted-foreground w-12 text-xs tabular-nums">
          {row.vmid}
        </Text>
      ) : null}
      <View className="flex-1">
        <Text className="text-sm" numberOfLines={1}>
          {label(row)}
        </Text>
        {row.type !== 'node' && row.node ? (
          <Text className="text-muted-foreground text-xs">
            {row.node}
          </Text>
        ) : null}
      </View>
      {(row.type === 'storage' ? row.maxdisk : row.maxmem) != null ? (
        <Text className="text-muted-foreground text-xs tabular-nums">{usage}</Text>
      ) : null}
      <Badge variant={STATUS_VARIANT[row.status ?? ''] ?? 'outline'}>
        <Text>{row.status ?? 'unknown'}</Text>
      </Badge>
    </View>
  );
}
