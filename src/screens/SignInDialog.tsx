import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { errorMessage } from '@/lib/errors';
import { userId } from '@/models';
import { useSignIn } from '@/query/hooks';
import { useProfiles } from '@/state/profiles';
import { loadLoginSecret } from '@/storage/secrets';

interface SignInDialogProps {
  loginId: string | null;
  onClose: () => void;
}

export function SignInDialog({ loginId, onClose }: SignInDialogProps) {
  const login = useProfiles((state) => state.logins.find((candidate) => candidate.id === loginId));
  const cluster = useProfiles((state) => state.clusters.find((candidate) => candidate.id === login?.clusterId));
  const [secret, setSecret] = useState('');
  const signIn = useSignIn();
  const { reset } = signIn;

  // Prefill a keychain-stored secret (native only; always null on web).
  useEffect(() => {
    setSecret('');
    reset();
    if (!loginId) return;
    let cancelled = false;
    void loadLoginSecret(loginId).then((stored) => {
      if (!cancelled && stored) setSecret(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [loginId, reset]);

  if (!login || !cluster) return null;
  const isToken = login.authMethod === 'token';

  const submit = () => {
    if (!secret || signIn.isPending) return;
    signIn.mutate({ loginId: login.id, secret }, { onSuccess: onClose });
  };

  return (
    <Dialog open={loginId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[22rem] max-w-full">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>
            {isToken ? `${userId(login)}!${login.tokenName}` : userId(login)} on {cluster.name}
          </DialogDescription>
        </DialogHeader>
        <View className="gap-1.5">
          <Label nativeID="sign-in-secret">{isToken ? 'Token secret' : 'Password'}</Label>
          <Input
            aria-labelledby="sign-in-secret"
            value={secret}
            onChangeText={setSecret}
            onSubmitEditing={submit}
            secureTextEntry
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isToken ? 'off' : 'current-password'}
          />
        </View>
        {signIn.error ? <Text className="text-destructive text-sm">{errorMessage(signIn.error)}</Text> : null}
        <DialogFooter>
          <Button variant="outline" onPress={onClose}>
            <Text>Cancel</Text>
          </Button>
          <Button onPress={submit} disabled={!secret || signIn.isPending}>
            <Text>{signIn.isPending ? 'Signing in…' : 'Sign in'}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
