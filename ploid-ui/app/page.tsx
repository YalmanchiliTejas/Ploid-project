"use client";

import dynamic from "next/dynamic";

const Worksheet = dynamic(() => import("./worksheet"), { ssr: false });

export default function Home() {
  return <Worksheet />;
}
