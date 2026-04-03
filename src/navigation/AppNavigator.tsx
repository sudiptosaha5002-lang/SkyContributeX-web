import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { PinSetupScreen } from '../screens/PinSetupScreen';
import { PinUnlockScreen } from '../screens/PinUnlockScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CreateCardScreen } from '../screens/CreateCardScreen';
import { CardDetailsScreen } from '../screens/CardDetailsScreen';
import { MemberEditScreen } from '../screens/MemberEditScreen';
import { InvoicePreviewScreen } from '../screens/InvoicePreviewScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export const AppNavigator = () => {
  const { isSetup, isUnlocked, isReady } = useAuth();

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isSetup && isUnlocked ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="CreateCard" component={CreateCardScreen} />
          <Stack.Screen name="CardDetails" component={CardDetailsScreen} />
          <Stack.Screen name="MemberEdit" component={MemberEditScreen} />
          <Stack.Screen name="InvoicePreview" component={InvoicePreviewScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isSetup ? (
            <Stack.Screen name="PinUnlock" component={PinUnlockScreen} />
          ) : (
            <Stack.Screen name="PinSetup" component={PinSetupScreen} />
          )}
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
};
