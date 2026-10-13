import * as SecureStore from "expo-secure-store";
import { Ruta35Api, type TokenStore } from "./api";

declare const process: { readonly env: { readonly EXPO_PUBLIC_API_BASE_URL?: string } };

export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync("ruta35_access_token"),
  set: (token) => SecureStore.setItemAsync("ruta35_access_token", token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync("ruta35_access_token")
};
export const bookingAttemptStore = {
  get: () => SecureStore.getItemAsync("ruta35_booking_attempt"),
  set: (key: string) => SecureStore.setItemAsync("ruta35_booking_attempt", key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync("ruta35_booking_attempt")
};

const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
if (!apiUrl) throw new Error("Set EXPO_PUBLIC_API_BASE_URL to the Ruta 35 backend HTTPS URL");
export const api = new Ruta35Api(apiUrl, secureTokenStore);
