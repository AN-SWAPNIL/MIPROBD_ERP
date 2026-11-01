import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "./session";
import { queryScope } from "./queryScope";

function ScopedQueries({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } }
  }));
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export default function SessionQueryProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.session?.user);
  // A keyed subtree prevents even one render of another identity's cached records or modal state.
  return <ScopedQueries key={queryScope(user)}>{children}</ScopedQueries>;
}
