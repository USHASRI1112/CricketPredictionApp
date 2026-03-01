import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { shouldRefetchMatches } from './src/helpers/ShouldRefetchMatches';
import AllMatchesScreen from './src/screens/AllMatchesScreen';
import HomeScreen from './src/screens/HomeScreen';
import MatchScreen from './src/screens/MatchScreen';
import { fetchMatches } from './src/services/Matches';
import { Match } from './src/types';

export type RootStackParamList = {
  Home: undefined;
  AllMatches: undefined;
  Match: { matchId: string; match: Match };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const queryClient = new QueryClient();

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    const checkRefetch = async () => {
      try {
        const should = await shouldRefetchMatches();
        if (should) {
          const data = await fetchMatches();
          queryClient.setQueryData(['ALL_MATCHES', 'storage'], data);
        }
      } catch (e) {
        console.warn('Error during startup refetch check', e);
      }
    };

    checkRefetch();
  }, []);

  return (
    <>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle: {
                backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
              },
              headerTintColor: isDarkMode ? '#ffffff' : '#000000',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{
                // title: '🏏 Cricket Prediction',
                // headerStyle: {
                //   backgroundColor: isDarkMode ? '#1f2937' : '#3b82f6',
                // },
                headerShown: false,
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="AllMatches"
              component={AllMatchesScreen}
              options={{
                title: 'All Matches',
              }}
            />
            <Stack.Screen
              name="Match"
              component={MatchScreen}
              options={{
                title: 'Match Prediction',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </>
  );
}
