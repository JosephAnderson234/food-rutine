import { ShoppingView } from "@app/components/shopping/ShoppingView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compras" };

export default function ComprasPage() {
  return <ShoppingView />;
}
