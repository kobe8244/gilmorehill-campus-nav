import React, { useState } from "react";
import { StyleSheet, View, Text, Switch, ScrollView } from "react-native";
import { Colors, FontSizes, Spacing, TouchTargets } from "../constants/theme";

interface SettingToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function SettingToggle({ label, value, onValueChange }: SettingToggleProps) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.border, true: Colors.primaryLight }}
        thumbColor={value ? Colors.accent : Colors.surface}
        accessibilityLabel={`${label}, ${value ? "on" : "off"}`}
        accessibilityRole="switch"
        style={styles.switch}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [highContrast, setHighContrast] = useState(false);
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const [wheelchairRoutes, setWheelchairRoutes] = useState(false);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.header} accessibilityRole="header">
        Settings
      </Text>

      <SettingToggle
        label="High Contrast Mode"
        value={highContrast}
        onValueChange={setHighContrast}
      />
      <SettingToggle
        label="Voice Guidance"
        value={voiceGuidance}
        onValueChange={setVoiceGuidance}
      />
      <SettingToggle
        label="Wheelchair-Accessible Routes Only"
        value={wheelchairRoutes}
        onValueChange={setWheelchairRoutes}
      />

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Gilmorehill Campus Navigation v1.0.0
        </Text>
        <Text style={styles.infoText}>
          ENG5059P MSc Project — University of Glasgow
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    fontSize: FontSizes.title,
    fontWeight: "bold",
    color: Colors.primary,
    marginBottom: Spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    minHeight: TouchTargets.minHeight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingLabel: {
    fontSize: FontSizes.body,
    color: Colors.text,
    flex: 1,
    fontWeight: "500",
  },
  switch: {
    marginLeft: Spacing.md,
  },
  infoBox: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  infoText: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: Spacing.xs,
  },
});
