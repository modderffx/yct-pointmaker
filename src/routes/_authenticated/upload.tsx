import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: () => {
    throw redirect({ to: "/tournaments" });
  },
});
