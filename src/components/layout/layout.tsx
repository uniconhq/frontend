import { useQuery } from "@tanstack/react-query";
import { PropsWithChildren, useEffect } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Outlet, useLocation } from "react-router-dom";

import AppSidebar from "@/components/layout/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { getUserProfile } from "@/features/auth/queries";
import { useUserStore } from "@/store/user/user-store-provider";

import Breadcrumb from "./breadcrumb";

const Layout: React.FC<PropsWithChildren> = () => {
  const { data: userProfile, isLoading } = useQuery(getUserProfile());

  const { user, setUser } = useUserStore((store) => store);
  const { pathname } = useLocation();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (userProfile) {
      setUser(userProfile);
    } else {
      setUser();
    }
  }, [setUser, userProfile, isLoading]);

  return (
    <main className="flex h-screen w-screen flex-col overflow-y-scroll bg-[#141414]">
      <Toaster />
      <DndProvider backend={HTML5Backend}>
        <div className="flex max-h-screen w-full text-neutral-300">
          {user && (
            <SidebarProvider>
              <AppSidebar pathname={pathname} />
              <main className="w-full p-4">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <Breadcrumb />
                </div>
                <Outlet />
              </main>
            </SidebarProvider>
          )}
          {!user && <Outlet />}
        </div>
      </DndProvider>
    </main>
  );
};

export default Layout;
