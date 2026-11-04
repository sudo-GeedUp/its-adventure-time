import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import {
  PACKAGE_TYPE,
  PurchasesPackage,
} from "react-native-purchases";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useTheme } from "@/hooks/useTheme";
import { getOfferings } from "@/config/revenuecat";
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "@/constants/LegalUrls";

const PREMIUM_FEATURES = [
  "AI Recovery Scan",
  "Unlimited Adventures",
  "Trail Updates & Events",
  "Community Trail Data",
  "Rally Navigator",
  "Offline Maps",
  "Priority Support",
];

const FEATURE_CARDS = [
  {
    icon: "scan" as const,
    title: "AI Recovery Scan",
    description: "Get AI-powered recommendations for recovery situations",
  },
  {
    icon: "map" as const,
    title: "Unlimited Adventures",
    description: "Track and save your off-road adventures",
  },
  {
    icon: "notifications" as const,
    title: "Trail Updates",
    description: "See trail conditions and community warnings",
  },
  {
    icon: "speedometer" as const,
    title: "Rally Navigator",
    description: "Navigate with voice callouts",
  },
  {
    icon: "cloud-offline" as const,
    title: "Offline Maps",
    description: "Download maps for remote areas",
  },
  {
    icon: "people" as const,
    title: "Community Access",
    description: "View and share trail events and hazards",
  },
];

function planTitle(packageType: PACKAGE_TYPE): string {
  switch (packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return "Yearly";
    case PACKAGE_TYPE.MONTHLY:
      return "Monthly";
    case PACKAGE_TYPE.SIX_MONTH:
      return "6 Month";
    case PACKAGE_TYPE.THREE_MONTH:
      return "3 Month";
    case PACKAGE_TYPE.TWO_MONTH:
      return "2 Month";
    case PACKAGE_TYPE.WEEKLY:
      return "Weekly";
    default:
      return "Subscription";
  }
}

function planPeriod(pkg: PurchasesPackage): string {
  const period = pkg.product.subscriptionPeriod;
  if (period === "P1Y") return "/year";
  if (period === "P1M") return "/month";
  if (period === "P6M") return "/6 months";
  if (period === "P3M") return "/3 months";
  if (period === "P2M") return "/2 months";
  if (period === "P1W") return "/week";
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return "/year";
    case PACKAGE_TYPE.MONTHLY:
      return "/month";
    case PACKAGE_TYPE.SIX_MONTH:
      return "/6 months";
    case PACKAGE_TYPE.THREE_MONTH:
      return "/3 months";
    case PACKAGE_TYPE.TWO_MONTH:
      return "/2 months";
    case PACKAGE_TYPE.WEEKLY:
      return "/week";
    default:
      return "";
  }
}

function planLength(pkg: PurchasesPackage): string {
  const period = pkg.product.subscriptionPeriod;
  if (period === "P1Y") return "1 year";
  if (period === "P1M") return "1 month";
  if (period === "P6M") return "6 months";
  if (period === "P3M") return "3 months";
  if (period === "P2M") return "2 months";
  if (period === "P1W") return "1 week";
  return planTitle(pkg.packageType).toLowerCase();
}

export default function PaywallScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { purchaseSubscription, restore } = useSubscription();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadOfferings = async () => {
    setLoadingOfferings(true);
    setOfferingsError(null);
    try {
      const offering = await getOfferings();
      const eligiblePackages = (offering?.availablePackages ?? []).filter(
        (pkg) =>
          [
            PACKAGE_TYPE.ANNUAL,
            PACKAGE_TYPE.MONTHLY,
            PACKAGE_TYPE.SIX_MONTH,
            PACKAGE_TYPE.THREE_MONTH,
            PACKAGE_TYPE.TWO_MONTH,
            PACKAGE_TYPE.WEEKLY,
          ].includes(pkg.packageType),
      );

      if (eligiblePackages.length === 0) {
        setPackages([]);
        setSelectedPlanId(null);
        setOfferingsError(
          "Subscription plans couldn't be loaded. Check your connection and try again. If this keeps happening, please contact support.",
        );
        return;
      }

      setPackages(eligiblePackages);
      setSelectedPlanId((current) => {
        if (current && eligiblePackages.some((pkg) => pkg.identifier === current)) {
          return current;
        }
        const defaultPackage =
          eligiblePackages.find((pkg) => pkg.packageType === PACKAGE_TYPE.ANNUAL) ??
          eligiblePackages.find((pkg) => pkg.packageType === PACKAGE_TYPE.MONTHLY) ??
          eligiblePackages[0];
        return defaultPackage.identifier;
      });
    } catch (error) {
      console.error("Error loading subscription offerings:", error);
      setPackages([]);
      setSelectedPlanId(null);
      setOfferingsError(
        "Subscription plans couldn't be loaded. Check your connection and try again.",
      );
    } finally {
      setLoadingOfferings(false);
    }
  };

  useEffect(() => {
    void loadOfferings();
  }, []);

  const selectedPlan = useMemo(
    () => packages.find((pkg) => pkg.identifier === selectedPlanId),
    [packages, selectedPlanId],
  );

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open link", "Please try again later.");
    }
  };

  const handlePurchase = async () => {
    if (!selectedPlan || purchasing || restoring) return;
    setPurchasing(true);
    try {
      const success = await purchaseSubscription(
        selectedPlan.product.identifier,
      );
      if (success) {
        Alert.alert("Welcome to Premium!", "Your Premium access is ready.", [
          { text: "Get Started", onPress: () => navigation.goBack() },
        ]);
      } else {
        // A false result can mean a cancellation or that the entitlement wasn't
        // returned. Avoid claiming cancellation: a store transaction may have
        // completed even if RevenueCat entitlement configuration needs attention.
        Alert.alert(
          "Premium not confirmed",
          "The purchase wasn't confirmed as active. If you completed the store purchase, try Restore Purchases or contact support before trying again.",
        );
      }
    } catch (error) {
      console.error("Purchase failed:", error);
      Alert.alert(
        "Purchase failed",
        "We couldn't confirm the purchase. Check your connection and store account, then try again. If you were charged, use Restore Purchases or contact support.",
      );
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (purchasing || restoring) return;
    setRestoring(true);
    try {
      const success = await restore();
      if (success) {
        Alert.alert("Purchases restored", "Your Premium access is ready.", [
          { text: "Continue", onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert(
          "No active purchase found",
          "We couldn't find an active Premium subscription for this store account.",
        );
      }
    } catch (error: any) {
      console.error("Restore failed:", error);
      Alert.alert(
        "Restore failed",
        error?.message || "Please check your connection and try again.",
      );
    } finally {
      setRestoring(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.backgroundDefault },
    header: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    closeButton: { padding: 8 },
    scrollContent: { paddingBottom: 40 },
    hero: {
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 28,
    },
    heroTitle: {
      fontSize: 32,
      fontWeight: "bold",
      color: theme.text,
      textAlign: "center",
      marginBottom: 8,
    },
    heroSubtitle: {
      fontSize: 17,
      color: theme.text,
      opacity: 0.75,
      textAlign: "center",
      lineHeight: 24,
    },
    features: { paddingHorizontal: 20, marginBottom: 24 },
    feature: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 12,
      backgroundColor: theme.backgroundSecondary,
      padding: 14,
      borderRadius: 12,
    },
    featureIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary + "20",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    featureContent: { flex: 1 },
    featureTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 4,
    },
    featureDescription: {
      fontSize: 14,
      color: theme.text,
      opacity: 0.72,
      lineHeight: 20,
    },
    plans: { paddingHorizontal: 20, marginBottom: 24 },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: theme.text,
      marginBottom: 16,
      textAlign: "center",
    },
    plan: {
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 16,
      padding: 18,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: "transparent",
    },
    selectedPlan: { borderColor: theme.primary },
    planHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    planTitle: { fontSize: 18, fontWeight: "bold", color: theme.text },
    priceRow: { flexDirection: "row", alignItems: "baseline" },
    price: { fontSize: 24, fontWeight: "bold", color: theme.primary },
    period: { fontSize: 14, color: theme.text, opacity: 0.7, marginLeft: 4 },
    unavailable: {
      alignItems: "center",
      padding: 20,
      borderRadius: 14,
      backgroundColor: theme.backgroundSecondary,
    },
    unavailableText: {
      color: theme.text,
      opacity: 0.8,
      textAlign: "center",
      lineHeight: 21,
      marginVertical: 12,
    },
    retryButton: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: theme.primary,
    },
    retryText: { color: "#fff", fontWeight: "700" },
    footer: { paddingHorizontal: 20, marginBottom: 20 },
    disclosure: {
      fontSize: 12,
      color: theme.text,
      opacity: 0.72,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 12,
    },
    included: {
      fontSize: 12,
      color: theme.text,
      opacity: 0.72,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 12,
    },
    legalLinks: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    legalLink: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.primary,
      textDecorationLine: "underline",
    },
    cta: { paddingHorizontal: 20, marginBottom: 12 },
    subscribeButton: {
      borderRadius: 12,
      minHeight: 54,
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    subscribeText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
    restoreButton: { padding: 14, alignItems: "center" },
    restoreText: { color: theme.primary, fontSize: 16, fontWeight: "600" },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.backgroundDefault,
    },
  });

  if (loadingOfferings) {
    return (
      <SafeAreaView style={styles.loading} edges={["top"]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ color: theme.text, marginTop: 12 }}>
          Loading subscription plans…
        </Text>
      </SafeAreaView>
    );
  }

  const renewalDisclosure = selectedPlan
    ? `${selectedPlan.product.title || planTitle(selectedPlan.packageType)} (${planLength(selectedPlan)}) renews at ${selectedPlan.product.priceString}${planPeriod(selectedPlan)} unless cancelled before renewal. Manage or cancel through your app store subscription settings.`
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close Premium screen"
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Ionicons
            name="star"
            size={58}
            color={theme.primary}
            style={{ marginBottom: 14 }}
          />
          <Text style={styles.heroTitle}>Unlock Premium</Text>
          <Text style={styles.heroSubtitle}>
            Get more from every off-road adventure.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURE_CARDS.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={theme.primary} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>
          {packages.length > 0 ? (
            packages.map((pkg) => (
              <TouchableOpacity
                key={pkg.identifier}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedPlanId === pkg.identifier }}
                style={[
                  styles.plan,
                  selectedPlanId === pkg.identifier && styles.selectedPlan,
                ]}
                onPress={() => setSelectedPlanId(pkg.identifier)}
                activeOpacity={0.75}
              >
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planTitle}>
                      {planTitle(pkg.packageType)}
                    </Text>
                    <Text style={{ color: theme.tabIconDefault, marginTop: 4 }}>
                      {planLength(pkg)}
                    </Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{pkg.product.priceString}</Text>
                    <Text style={styles.period}>{planPeriod(pkg)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.unavailable}>
              <Ionicons name="alert-circle-outline" size={30} color={theme.warning} />
              <Text style={styles.unavailableText}>
                {offeringsError || "Subscription plans are temporarily unavailable."}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.retryButton}
                onPress={() => void loadOfferings()}
                disabled={loadingOfferings}
              >
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          {renewalDisclosure && (
            <Text style={styles.disclosure}>{renewalDisclosure}</Text>
          )}
          <Text style={styles.included}>
            Includes: {PREMIUM_FEATURES.join(", ")}.
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => void openUrl(TERMS_OF_SERVICE_URL)}>
              <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.tabIconDefault }}>  •  </Text>
            <TouchableOpacity onPress={() => void openUrl(PRIVACY_POLICY_URL)}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cta}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[
              styles.subscribeButton,
              { backgroundColor: theme.primary, opacity: selectedPlan ? 1 : 0.55 },
            ]}
            onPress={() => void handlePurchase()}
            disabled={purchasing || restoring || !selectedPlan}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.subscribeText}>Subscribe Now</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.restoreButton}
            onPress={() => void handleRestore()}
            disabled={purchasing || restoring}
          >
            {restoring ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={styles.restoreText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
