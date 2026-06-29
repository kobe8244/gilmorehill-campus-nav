import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import MapScreen from "../screens/MapScreen";
import RoutePlannerScreen from "../screens/RoutePlannerScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { Colors, FontSizes } from "../constants/theme";

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Map: "🗺️",
    "Route Planner": "🧭",
    Settings: "⚙️",
  };
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icons[label] ?? "•"}
    </Text>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarAccessibilityLabel: `${route.name} tab`,
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Route Planner" component={RoutePlannerScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    paddingBottom: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  tabLabel: {
    fontSize: FontSizes.small,
    fontWeight: "600",
  },
  icon: {
    fontSize: 24,
  },
  iconFocused: {
    fontSize: 28,
  },
});
