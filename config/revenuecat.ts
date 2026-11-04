import Purchases, {
  LOG_LEVEL,
  PurchasesOffering,
  CustomerInfo,
} from "react-native-purchases";
import { Platform } from "react-native";

// RevenueCat API Keys
// Use platform-specific public SDK keys from the RevenueCat dashboard.
// iOS production keys start with `appl_`; Android keys start with `goog_`.
// Test Store keys (`test_`) are intentionally rejected in release builds.
const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_ANDROID_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";

const isTestApiKey = (key: string | undefined) =>
  !!key && key.startsWith("test_");

let revenueCatConfigured = false;
let initializationPromise: Promise<boolean> | null = null;

export const isRevenueCatConfigured = () => revenueCatConfigured;

export const getRevenueCatInitError = () => {
  if (Platform.OS === "web") return null;
  const apiKey = Platform.select({
    ios: REVENUECAT_IOS_KEY,
    android: REVENUECAT_ANDROID_KEY,
  });
  if (!apiKey) return "RevenueCat API key is not configured.";
  if (isTestApiKey(apiKey))
    return "RevenueCat Test Store key is not allowed in release builds.";
  return null;
};

// Product IDs
// These must exactly match product identifiers in App Store Connect / RevenueCat.
export const PRODUCT_IDS = {
  MONTHLY_SUBSCRIPTION: "com.masongallegos.itsadventuretime.premium.monthly.v2",
  YEARLY_SUBSCRIPTION: "com.masongallegos.itsadventuretime.premium.yearly.v2",
};

// Entitlement IDs (configured in RevenueCat dashboard)
export const ENTITLEMENT_IDS = {
  PREMIUM: "It's Adventure Time Pro",
};

export const initializeRevenueCat = async (): Promise<boolean> => {
  if (revenueCatConfigured) return true;
  if (Platform.OS === "web") {
    console.log("RevenueCat not available on web platform");
    return false;
  }
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const apiKey = Platform.select({
        ios: REVENUECAT_IOS_KEY,
        android: REVENUECAT_ANDROID_KEY,
      });

      if (!apiKey) {
        console.warn(
          "RevenueCat API key not configured; subscription features disabled.",
        );
        return false;
      }

      if (isTestApiKey(apiKey)) {
        console.warn(
          "RevenueCat Test Store API key detected in a release build. Set the platform's public RevenueCat SDK key.",
        );
        return false;
      }

      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.INFO);
      await Purchases.configure({ apiKey });
      revenueCatConfigured = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize RevenueCat:", error);
      return false;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

export const getOfferings = async (): Promise<PurchasesOffering | null> => {
  try {
    // The paywall can be opened before SubscriptionProvider finishes its async
    // setup. Ensure the SDK is configured here too, sharing the same in-flight
    // promise so the SDK is never configured twice during that race.
    const initialized = revenueCatConfigured || (await initializeRevenueCat());
    if (!initialized) return null;

    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (error) {
    console.error("Error fetching offerings:", error);
    return null;
  }
};

// Configuration faults are logged for diagnostics; users only ever see this.
export const SUBSCRIPTION_UNAVAILABLE_MESSAGE =
  "Subscriptions are temporarily unavailable. Please try again later.";

export const purchaseSubscription = async (
  productIdentifier: string = PRODUCT_IDS.MONTHLY_SUBSCRIPTION,
): Promise<CustomerInfo | null> => {
  try {
    if (!revenueCatConfigured) {
      console.error(
        "RevenueCat not configured:",
        getRevenueCatInitError() || "unknown reason",
      );
      throw new Error(SUBSCRIPTION_UNAVAILABLE_MESSAGE);
    }

    const offerings = await getOfferings();
    if (!offerings) {
      console.error(
        "No RevenueCat offerings returned. Verify the offering is linked to products in App Store Connect / Play Console.",
      );
      throw new Error(SUBSCRIPTION_UNAVAILABLE_MESSAGE);
    }

    const packageToBuy = offerings.availablePackages.find(
      (pkg) => pkg.product.identifier === productIdentifier,
    );

    if (!packageToBuy) {
      console.error(
        `Product "${productIdentifier}" missing from the current offering. Check that the product ID matches the store and is included in the active RevenueCat offering.`,
      );
      throw new Error(SUBSCRIPTION_UNAVAILABLE_MESSAGE);
    }

    const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
    return customerInfo;
  } catch (error: any) {
    if (!error.userCancelled) {
      console.error("Purchase error:", error);
      throw error;
    }
    return null;
  }
};

export const purchaseMonthlySubscription = async () =>
  purchaseSubscription(PRODUCT_IDS.MONTHLY_SUBSCRIPTION);

export const restorePurchases = async (): Promise<CustomerInfo | null> => {
  try {
    if (!revenueCatConfigured) {
      throw new Error(
        getRevenueCatInitError() || "RevenueCat is not configured.",
      );
    }
    return await Purchases.restorePurchases();
  } catch (error) {
    console.error("Restore error:", error);
    throw error;
  }
};

export const checkPremiumStatus = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_IDS.PREMIUM];
  } catch (error) {
    console.error("Error checking premium status:", error);
    return false;
  }
};
