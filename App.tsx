import './global.css';

import { PortalHost } from '@rn-primitives/portal';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { AppProviders } from './src/AppProviders';
import { AddClusterScreen } from './src/screens/AddClusterScreen';
import { ClusterScreen } from './src/screens/ClusterScreen';
import { ClustersScreen } from './src/screens/ClustersScreen';

// A plain state switch until the app needs real navigation.
type Route =
  | { name: 'clusters'; signInLoginId?: string }
  | { name: 'add-cluster' }
  | { name: 'cluster'; loginId: string };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'clusters' });
  const { theme } = useUniwind();

  return (
    <SafeAreaProvider>
      <AppProviders>
        <View className="bg-background flex-1">
          <SafeAreaView style={{ flex: 1 }}>
            {route.name === 'clusters' ? (
              <ClustersScreen
                initialSignInLoginId={route.signInLoginId}
                onAddCluster={() => setRoute({ name: 'add-cluster' })}
                onOpenLogin={(loginId) => setRoute({ name: 'cluster', loginId })}
              />
            ) : route.name === 'add-cluster' ? (
              <AddClusterScreen
                onCancel={() => setRoute({ name: 'clusters' })}
                onCreated={(loginId) => setRoute({ name: 'clusters', signInLoginId: loginId })}
              />
            ) : (
              <ClusterScreen loginId={route.loginId} onBack={() => setRoute({ name: 'clusters' })} />
            )}
          </SafeAreaView>
        </View>
        {/* Inside the providers: portalled dialogs use React Query. */}
        <PortalHost />
      </AppProviders>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}
