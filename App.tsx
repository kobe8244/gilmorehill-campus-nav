import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import TabNavigator from "./src/navigation/TabNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <TabNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
