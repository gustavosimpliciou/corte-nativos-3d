import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight, Layers, Hexagon, Maximize, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroCanvas } from '@/components/3d/HeroCanvas';

export default function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground overflow-hidden relative">
      <HeroCanvas />
      
      <header className="w-full flex items-center justify-between p-6 z-10">
        <div className="flex items-center text-primary font-bold text-xl tracking-tighter">
          <Layers className="w-6 h-6 mr-2" />
          NATIVOS 3D
        </div>
        <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Features</a>
          <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
          <a href="#" className="hover:text-foreground transition-colors">Pricing</a>
          <Link href="/dashboard" className="text-foreground border border-border px-4 py-2 rounded-md hover:bg-accent transition-colors">
            Log In
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Professional Edition v2.0
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
            Precision 3D Model <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-300">
              Preparation & Cutting
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            A focused, engineering-grade workspace for makers and designers. Split, hollow, and prep meshes for printing without the bloat of full 3D suites.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="h-14 px-8 text-base font-semibold group bg-primary hover:bg-primary/90 text-primary-foreground">
                Launch Workspace
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="h-14 px-8 text-base font-semibold border-border hover:bg-accent text-foreground">
              View Documentation
            </Button>
          </div>
        </motion.div>
      </main>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 p-6 z-10 mt-auto bg-background/50 backdrop-blur-md border-t border-border">
        <div className="p-6">
          <Hexagon className="w-8 h-8 text-primary mb-4" />
          <h3 className="font-semibold text-lg mb-2">Smart Selection</h3>
          <p className="text-muted-foreground text-sm">Advanced region growing and smart-select tools that respect topology.</p>
        </div>
        <div className="p-6">
          <Maximize className="w-8 h-8 text-primary mb-4" />
          <h3 className="font-semibold text-lg mb-2">Precision Cuts</h3>
          <p className="text-muted-foreground text-sm">Plane, boolean, and manual cuts with automatic hole filling and repair.</p>
        </div>
        <div className="p-6">
          <Activity className="w-8 h-8 text-primary mb-4" />
          <h3 className="font-semibold text-lg mb-2">Performant Core</h3>
          <p className="text-muted-foreground text-sm">Engineered to handle multi-million polygon meshes directly in the browser.</p>
        </div>
      </div>
    </div>
  );
}
