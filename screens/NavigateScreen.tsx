import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import ThemedText from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { TrailCardSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import ExploreMapScreen from "./ExploreMapScreen";
import {
  getTrailsNearLocation,
  filterTrailsByDifficulty,
  filterTrailsByLandType,
  Trail,
} from "@/utils/trails";
import { calculateDistance } from "@/utils/location";
import { OfflineMapsManager } from "@/utils/offlineMaps";
import { storage } from "@/utils/storage";
import type { CompletedAdventure } from "@/utils/storage";
import { aggregateTrailCommunityData } from "@/utils/communityTrailInsights";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccountAccess, CommunityAdventuresService } from "@/utils/firebase";

// ... existing NavigateScreen implementation ...
