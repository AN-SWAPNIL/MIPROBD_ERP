import { useQuery } from "@tanstack/react-query";
import { publicSiteService } from "./publicSiteService";

export function usePublicSettings() {
  return useQuery({
    queryKey: ["public", "site-settings"],
    queryFn: publicSiteService.settings
  });
}
