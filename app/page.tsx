"use client"

import { useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { LeftPanel } from '@/components/layout/left-panel'
import { RightPanel } from '@/components/layout/right-panel'
import { StatusBar } from '@/components/layout/status-bar'
import { CutActions } from '@/components/layout/cut-actions'
import { PlaneCutPanel } from '@/components/layout/plane-cut-panel'
import { ExportPanel } from '@/components/layout/export-panel'
import { Viewport3D } from '@/components/viewport/viewport-3d'

export default function NativosCut() {
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <main
      className="flex flex-col h-dvh w-screen overflow-hidden select-none"
      style={{ background: 'oklch(0.08 0 0)' }}
    >
      {/* Barra superior */}
      <TopBar onExport={() => setExportOpen(true)} />

      {/* Área de trabalho */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Painel de ferramentas - esquerda */}
        <LeftPanel />

        {/* Viewport 3D — centro */}
        <div className="flex-1 relative overflow-hidden">
          <Viewport3D />
          {/* Ações de corte flutuantes */}
          <CutActions />
          {/* Painel de corte de sólido por plano */}
          <PlaneCutPanel />
        </div>

        {/* Painel de informações - direita */}
        <RightPanel />
      </div>

      {/* Barra de status */}
      <StatusBar />

      {/* Modal de exportação */}
      <ExportPanel open={exportOpen} onClose={() => setExportOpen(false)} />
    </main>
  )
}
