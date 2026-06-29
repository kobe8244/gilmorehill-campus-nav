import React from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { campusGraph } from "../data/campusGraph";
import { Colors, FontSizes } from "../constants/theme";

const GLASGOW_UNI = {
  latitude: 55.8721,
  longitude: -4.2882,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header} accessibilityRole="header">
        Campus Map
      </Text>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={GLASGOW_UNI}
        accessibilityLabel="Map of University of Glasgow Gilmorehill campus"
      >
        {campusGraph.nodes.map((node) => (
          <Marker
            key={node.id}
            coordinate={{ latitude: node.lat, longitude: node.lng }}
            title={node.name}
            accessibilityLabel={`Map marker for ${node.name}`}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    fontSize: FontSizes.title,
    fontWeight: "bold",
    color: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  map: {
    flex: 1,
  },
});
