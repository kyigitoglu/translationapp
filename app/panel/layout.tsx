import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auto Translate",
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
