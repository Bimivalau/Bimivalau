import { View, Pressable, StyleSheet, useWindowDimensions, FlatList } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRef, useState } from "react";

// Params: photos=<comma-separated encoded URLs>, index=<start index>
export default function PortfolioViewer() {
  const { photos, index } = useLocalSearchParams<{ photos: string; index?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const startIndex = index ? parseInt(index, 10) : 0;
  const urls = (photos || "").split(",").map(decodeURIComponent).filter(Boolean);
  const [current, setCurrent] = useState(startIndex);
  const listRef = useRef<FlatList<string>>(null);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <FlatList
        ref={listRef}
        data={urls}
        keyExtractor={(u, i) => `${i}-${u.slice(-12)}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
            <Image source={{ uri: item }} style={{ width, height: height * 0.9 }} contentFit="contain" />
          </View>
        )}
      />
      <View style={[s.top, { top: insets.top + 8 }]}>
        <Pressable testID="viewer-close" onPress={() => router.back()} style={s.iconBtn}>
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        <View style={s.counter}>
          <Feather name="image" size={13} color="#fff" />
          <View style={{ width: 6 }} />
          <Feather name="chevron-right" size={10} color="#fff" />
        </View>
      </View>
      <View style={s.dots}>
        {urls.map((_, i) => <View key={i} style={[s.dot, i === current && s.dotActive]} />)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  counter: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)" },
  dots: { position: "absolute", left: 0, right: 0, bottom: 40, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  dotActive: { backgroundColor: "#fff", width: 20 },
});
