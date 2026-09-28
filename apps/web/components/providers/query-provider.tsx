"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Prevent immediate refetching to reduce API spam
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes (Garbage Collection Time)

        // Strict retry logic: Fail fast on client errors, retry on network/server failures
        retry: (failureCount, error: any) => {
          const status = error?.status || error?.response?.status;
          // Do not retry Auth/Not Found errors (401, 403, 404)
          if (status >= 400 && status < 500) return false;
          // Retry network drops or 5xx server errors up to 2 times
          return failureCount < 2;
        },

        // Enterprise UI often involves frequent tab switching.
        // Disabling this globally prevents massive N+1 connection spikes to the DB.
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // SERVER: Always make a new query client per request.
    // DANGER: Sharing this across requests will leak one tenant's data to another.
    return makeQueryClient();
  } else {
    // BROWSER: Singleton pattern. Create only if it doesn't exist.
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState ensures the client is instantiated exactly once per component lifecycle
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" /> */}
    </QueryClientProvider>
  );
}
