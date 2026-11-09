import { LogIn, LogOut, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { describePolicy, SESSION_END_LABEL } from '@/lib/format';
import { userId, type Login } from '@/models';
import { signOut, useSessions } from '@/session/sessions';
import { removeCluster, removeLogin, useProfiles } from '@/state/profiles';
import { SignInDialog } from './SignInDialog';

interface ClustersScreenProps {
  initialSignInLoginId?: string;
  onAddCluster: () => void;
  onOpenLogin: (loginId: string) => void;
}

export function ClustersScreen({ initialSignInLoginId, onAddCluster, onOpenLogin }: ClustersScreenProps) {
  const clusters = useProfiles((state) => state.clusters);
  const logins = useProfiles((state) => state.logins);
  const lastEnded = useSessions((state) => state.lastEnded);
  const [signInLoginId, setSignInLoginId] = useState<string | null>(initialSignInLoginId ?? null);

  const endedLogin = lastEnded && lastEnded.reason !== 'signed-out' && logins.find((l) => l.id === lastEnded.loginId);

  return (
    <View className="flex-1">
      <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
        <Text className="text-lg font-semibold">ProxCommander</Text>
        <Button size="sm" onPress={onAddCluster}>
          <Icon as={Plus} />
          <Text>Add cluster</Text>
        </Button>
      </View>

      <ScrollView contentContainerClassName="gap-3 p-4">
        {endedLogin ? (
          <Card className="border-destructive/40 gap-0 px-4 py-3">
            <Text className="text-sm">
              {userId(endedLogin)} was signed out: {SESSION_END_LABEL[lastEnded.reason]}.
            </Text>
          </Card>
        ) : null}

        {clusters.length === 0 ? (
          <View className="items-center gap-2 py-16">
            <Text className="font-medium">No clusters yet</Text>
            <Text className="text-muted-foreground text-sm">Add a Proxmox VE cluster and its addresses to get started.</Text>
          </View>
        ) : null}

        {clusters.map((cluster) => (
          <Card key={cluster.id} className="gap-0 py-0">
            <View className="flex-row items-center gap-2 px-4 py-3">
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text className="font-semibold">{cluster.name}</Text>
                  {!cluster.rememberHostnames ? <Badge variant="outline"><Text>Not saved</Text></Badge> : null}
                </View>
                <Text className="text-muted-foreground text-sm" numberOfLines={1}>
                  {cluster.endpoints.map((endpoint) => endpoint.url.replace(/^https:\/\//, '')).join(' · ')}
                </Text>
              </View>
              <Button
                variant="ghost"
                size="icon"
                accessibilityLabel={`Remove ${cluster.name}`}
                onPress={() => removeCluster(cluster.id)}>
                <Icon as={Trash2} className="text-muted-foreground size-4" />
              </Button>
            </View>
            {logins
              .filter((login) => login.clusterId === cluster.id)
              .map((login) => (
                <View key={login.id}>
                  <Separator />
                  <LoginRow
                    login={login}
                    onOpen={() => onOpenLogin(login.id)}
                    onSignIn={() => setSignInLoginId(login.id)}
                  />
                </View>
              ))}
          </Card>
        ))}
      </ScrollView>

      <SignInDialog loginId={signInLoginId} onClose={() => setSignInLoginId(null)} />
    </View>
  );
}

interface LoginRowProps {
  login: Login;
  onOpen: () => void;
  onSignIn: () => void;
}

function LoginRow({ login, onOpen, onSignIn }: LoginRowProps) {
  const session = useSessions((state) => state.sessions[login.id]);
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium">
            {login.authMethod === 'token' ? `${userId(login)}!${login.tokenName}` : userId(login)}
          </Text>
          <Badge variant={session ? 'default' : 'secondary'}>
            <Text>{session ? 'Signed in' : 'Signed out'}</Text>
          </Badge>
        </View>
        <Text className="text-muted-foreground text-xs">
          {describePolicy(login.sessionPolicy)}
        </Text>
      </View>
      {session ? (
        <>
          <Button size="sm" variant="outline" onPress={onOpen}>
            <Text>Open</Text>
          </Button>
          <Button size="sm" variant="ghost" onPress={() => signOut(login.id)}>
            <Icon as={LogOut} />
            <Text>Sign out</Text>
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onPress={onSignIn}>
          <Icon as={LogIn} />
          <Text>Sign in</Text>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        accessibilityLabel={`Remove ${userId(login)}`}
        onPress={() => removeLogin(login.id)}>
        <Icon as={Trash2} className="text-muted-foreground size-4" />
      </Button>
    </View>
  );
}
