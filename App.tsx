import React, { useEffect, useRef } from 'react';
import { AppState, Pressable, StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { Colors } from './src/theme/colors';

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;

const LockWrapper: React.FC = () => {
  const { lock } = useAuth();
  const lastActiveRef = useRef(Date.now());
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      appState.current = next;
      if (next !== 'active') {
        lock();
      } else {
        lastActiveRef.current = Date.now();
      }
    });

    const timer = setInterval(() => {
      if (Date.now() - lastActiveRef.current > INACTIVITY_TIMEOUT_MS) {
        lock();
      }
    }, 5000);

    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [lock]);

  const updateActivity = () => {
    lastActiveRef.current = Date.now();
  };

  return (
    <Pressable style={styles.flex} onPressIn={updateActivity}>
      <AppNavigator />
    </Pressable>
  );
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <AuthProvider>
        <View style={styles.flex}>
          <LockWrapper />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

export default App;
