import React from 'react';
import { Link, useLocation } from 'wouter';
import { Layers, Activity, FolderDot, User, LogOut, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { label: 'Projects', path: '/dashboard', icon: FolderDot },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar Shell */}
      <aside className="w-16 lg:w-64 border-r border-border bg-card flex flex-col items-center lg:items-stretch py-6 flex-shrink-0 transition-all duration-300">
        <div className="flex items-center justify-center lg:justify-start lg:px-6 mb-10 text-primary">
          <Layers className="w-8 h-8 flex-shrink-0" />
          <span className="hidden lg:block ml-3 font-bold text-lg tracking-tight">NATIVOS</span>
        </div>
        
        <nav className="flex flex-col gap-2 px-3 flex-1 w-full">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "flex items-center p-3 rounded-md transition-colors w-full group text-muted-foreground hover:text-foreground hover:bg-accent/50",
                location.startsWith(item.path) && "bg-accent text-primary font-medium"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="hidden lg:block ml-3">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-3 w-full flex flex-col gap-2">
          <button className="flex items-center p-3 rounded-md transition-colors w-full text-muted-foreground hover:text-foreground hover:bg-accent/50">
            <User className="w-5 h-5 flex-shrink-0" />
            <span className="hidden lg:block ml-3">Account</span>
          </button>
          <button className="flex items-center p-3 rounded-md transition-colors w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="hidden lg:block ml-3">Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}
