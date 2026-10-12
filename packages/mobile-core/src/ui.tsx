import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

export const colors = { ink: "#102A35", teal: "#007C78", pale: "#EAF4F2", white: "#FFFFFF", muted: "#587078", red: "#A3332C", line: "#D4E1E0" };
export function Page({ children }: React.PropsWithChildren) { return <View style={styles.page}>{children}</View>; }
export function Heading({ title, subtitle }: { title: string; subtitle?: string }) { return <View style={styles.heading}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>; }
export function Card({ children }: React.PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Label({ children }: React.PropsWithChildren) { return <Text style={styles.label}>{children}</Text>; }
export function Field(props: TextInputProps) { return <TextInput {...props} placeholderTextColor="#809397" style={[styles.field, props.style]} />; }
export function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>;
}
export function Busy() { return <ActivityIndicator color={colors.teal} size="large" style={{ margin: 24 }} />; }
export function Notice({ children, error = false }: React.PropsWithChildren<{ error?: boolean }>) { return <Text accessibilityRole={error ? "alert" : "text"} style={[styles.notice, error && { color: colors.red }]}>{children}</Text>; }
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.pale, padding: 18, gap: 12 }, heading: { gap: 4, paddingTop: 12 }, title: { fontSize: 26, fontWeight: "800", color: colors.ink }, subtitle: { color: colors.muted, fontSize: 14 }, card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line }, label: { color: colors.muted, fontWeight: "700", fontSize: 13 }, field: { backgroundColor: colors.white, color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, fontSize: 16 }, button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: colors.teal, alignItems: "center", justifyContent: "center" }, buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 }, secondary: { backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.teal }, secondaryText: { color: colors.teal }, disabled: { opacity: 0.55 }, notice: { color: colors.muted, lineHeight: 20 } });
