import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { campusGraph } from "../data/campusGraph";
import { findShortestPath, PathResult } from "../navigation/dijkstra";
import { useTTS } from "../hooks/useTTS";
import { Colors, FontSizes, Spacing, TouchTargets } from "../constants/theme";

export default function RoutePlannerScreen() {
  const [startId, setStartId] = useState<string>(campusGraph.nodes[0].id);
  const [endId, setEndId] = useState<string>(campusGraph.nodes[1].id);
  const [result, setResult] = useState<PathResult | null>(null);
  const [noPath, setNoPath] = useState(false);
  const { speak } = useTTS();

  const handleFindRoute = () => {
    const pathResult = findShortestPath(campusGraph, startId, endId);
    if (pathResult) {
      setResult(pathResult);
      setNoPath(false);
      const names = pathResult.path.map(
        (id) => campusGraph.nodes.find((n) => n.id === id)?.name ?? id
      );
      speak(
        `Route found. ${Math.round(pathResult.totalDistance)} metres via ${names.join(", ")}.`
      );
    } else {
      setResult(null);
      setNoPath(true);
      speak("No route found between the selected locations.");
    }
  };

  const nodeNameById = (id: string): string =>
    campusGraph.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.header} accessibilityRole="header">
        Route Planner
      </Text>

      <Text style={styles.label} accessibilityRole="text">
        From:
      </Text>
      <View style={styles.pickerWrapper} accessible accessibilityLabel="Select starting location">
        <Picker
          selectedValue={startId}
          onValueChange={setStartId}
          style={styles.picker}
        >
          {campusGraph.nodes.map((node) => (
            <Picker.Item key={node.id} label={node.name} value={node.id} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label} accessibilityRole="text">
        To:
      </Text>
      <View style={styles.pickerWrapper} accessible accessibilityLabel="Select destination">
        <Picker
          selectedValue={endId}
          onValueChange={setEndId}
          style={styles.picker}
        >
          {campusGraph.nodes.map((node) => (
            <Picker.Item key={node.id} label={node.name} value={node.id} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleFindRoute}
        accessibilityRole="button"
        accessibilityLabel="Find route between selected locations"
      >
        <Text style={styles.buttonText}>Find Route</Text>
      </TouchableOpacity>

      {result && (
        <View
          style={styles.resultBox}
          accessible
          accessibilityLabel={`Route: ${Math.round(result.totalDistance)} metres`}
        >
          <Text style={styles.resultTitle}>Route Found</Text>
          <Text style={styles.resultDistance}>
            Distance: {Math.round(result.totalDistance)}m
          </Text>
          {result.path.map((id, index) => (
            <Text key={id} style={styles.resultStep}>
              {index + 1}. {nodeNameById(id)}
            </Text>
          ))}
        </View>
      )}

      {noPath && (
        <View style={styles.resultBox}>
          <Text style={styles.errorText}>
            No route found between these locations.
          </Text>
        </View>
      )}
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
  label: {
    fontSize: FontSizes.body,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  pickerWrapper: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 8,
    marginBottom: Spacing.md,
    minHeight: TouchTargets.minHeight,
    justifyContent: "center",
  },
  picker: {
    fontSize: FontSizes.body,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 8,
    alignItems: "center",
    minHeight: TouchTargets.minHeight,
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSizes.large,
    fontWeight: "bold",
  },
  resultBox: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultTitle: {
    fontSize: FontSizes.large,
    fontWeight: "bold",
    color: Colors.success,
    marginBottom: Spacing.sm,
  },
  resultDistance: {
    fontSize: FontSizes.body,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  resultStep: {
    fontSize: FontSizes.body,
    color: Colors.text,
    paddingVertical: Spacing.xs,
  },
  errorText: {
    fontSize: FontSizes.body,
    color: Colors.error,
    fontWeight: "600",
  },
});
