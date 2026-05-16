import { createFileRoute } from '@tanstack/react-router';
import { Loader2, Sparkles, BookOpen } from 'lucide-react';
import { useMemo } from 'react';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiGraph } from '@/lib/api/wiki';
import type { WikiGraphNode, WikiGraphEdge } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/graph')({
  component: WikiGraphPage,
});

const PROJECT_COLORS: Record<string, string> = {
  backend: '#f59e0b',
  frontend: '#3b82f6',
  'db-client': '#8b5cf6',
  'mcp-server': '#10b981',
  shared: '#ec4899',
  cli: '#f97316',
};

function nodeColor(project: string | null) {
  return project ? (PROJECT_COLORS[project] ?? '#6b7280') : '#6b7280';
}

interface PositionedNode extends WikiGraphNode {
  x: number;
  y: number;
}

function layoutNodes(nodes: WikiGraphNode[], _edges: WikiGraphEdge[]): PositionedNode[] {
  if (nodes.length === 0) return [];

  const W = 800;
  const H = 500;
  const CX = W / 2;
  const CY = H / 2;

  // Group by project, then lay out in clusters
  const groups: Record<string, WikiGraphNode[]> = {};
  for (const n of nodes) {
    const key = n.project ?? 'other';
    (groups[key] ??= []).push(n);
  }

  const groupKeys = Object.keys(groups);
  const positioned: PositionedNode[] = [];

  groupKeys.forEach((key, gi) => {
    const groupAngle = (gi / groupKeys.length) * Math.PI * 2;
    const groupR = Math.min(180, 80 + groupKeys.length * 20);
    const gx = CX + Math.cos(groupAngle) * groupR;
    const gy = CY + Math.sin(groupAngle) * groupR;

    const groupNodes = groups[key]!;
    groupNodes.forEach((n, ni) => {
      const innerAngle = (ni / groupNodes.length) * Math.PI * 2;
      const innerR = groupNodes.length === 1 ? 0 : Math.min(60, 20 + groupNodes.length * 8);
      positioned.push({
        ...n,
        x: gx + Math.cos(innerAngle) * innerR,
        y: gy + Math.sin(innerAngle) * innerR,
      });
    });
  });

  return positioned;
}

function WikiGraphPage() {
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;

  const { data, isLoading } = useWikiGraph(orgId);
  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];

  const positioned = useMemo(() => layoutNodes(nodes, edges), [nodes, edges]);

  const posMap = useMemo(() => new Map(positioned.map(n => [n.id, n])), [positioned]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Knowledge Graph</h2>
          <p className="text-sm text-muted-foreground">
            Visual map of wiki pages and their cross-references
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {nodes.length} pages · {edges.length} links
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && nodes.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">No wiki pages yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Create pages and link them to see the knowledge graph
          </p>
        </div>
      )}

      {!isLoading && nodes.length > 0 && (
        <div className="hidden sm:block rounded-xl border bg-card/50 backdrop-blur overflow-hidden">
          {/* SVG Graph — hidden on mobile (use adjacency list below instead) */}
          <div className="w-full overflow-x-auto">
            <svg viewBox="0 0 800 500" className="w-full" style={{ minWidth: 400, maxHeight: 520 }}>
              {/* Edges */}
              {edges.map((edge, i) => {
                const src = posMap.get(edge.sourceId);
                const tgt = posMap.get(edge.targetId);
                if (!src || !tgt) return null;
                return (
                  <line
                    key={i}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                    strokeWidth={1.5}
                    className="text-foreground"
                  />
                );
              })}

              {/* Nodes */}
              {positioned.map(node => {
                const color = nodeColor(node.project);
                const r = Math.max(14, Math.min(22, 14 + node.voteCount * 0.4));
                return (
                  <g key={node.id}>
                    <a href={`/wiki-browse/${node.slug}`}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r}
                        fill={color}
                        fillOpacity={0.2}
                        stroke={color}
                        strokeWidth={2}
                        className="cursor-pointer transition-all hover:fill-opacity-40"
                      />
                      <text
                        x={node.x}
                        y={node.y + r + 12}
                        textAnchor="middle"
                        fontSize={9}
                        fill="currentColor"
                        fillOpacity={0.7}
                        className="pointer-events-none text-foreground select-none"
                        style={{ fontFamily: 'system-ui, sans-serif' }}
                      >
                        {node.title.length > 18 ? node.title.slice(0, 16) + '…' : node.title}
                      </text>
                    </a>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="border-t px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(PROJECT_COLORS).map(([project, color]) => {
              const count = nodes.filter(n => n.project === project).length;
              if (count === 0) return null;
              return (
                <div
                  key={project}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color, opacity: 0.8 }}
                  />
                  {project} ({count})
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile hint — shown only when SVG graph is hidden */}
      {!isLoading && nodes.length > 0 && (
        <div className="sm:hidden rounded-xl border border-dashed py-4 px-4 text-center text-xs text-muted-foreground/60">
          Graph view available on larger screens · browsing all pages below
        </div>
      )}

      {/* Adjacency list */}
      {!isLoading && nodes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">All pages</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map(node => {
              const outbound = edges.filter(e => e.sourceId === node.id);
              const color = nodeColor(node.project);
              return (
                <a key={node.id} href={`/wiki-browse/${node.slug}`}>
                  <div className="rounded-lg border bg-card/50 p-3 text-sm hover:bg-card transition-colors">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium truncate">{node.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground pl-4">
                      <BookOpen className="h-3 w-3" />
                      {outbound.length} link{outbound.length !== 1 ? 's' : ''} out
                      {node.project && <span className="ml-auto">{node.project}</span>}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
