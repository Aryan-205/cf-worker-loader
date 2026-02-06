import {
    ReactFlow,
    Controls,
    Background,
    addEdge,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    type Node,
    type Edge,
    type Connection,
    type NodeProps,
    MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useId } from "react";
import type { FlowStep, PageDef, PageStep, ScriptStep, StartStep, EndStep } from "@orcratration/shared";

type ScriptOption = { _id: string; name: string };

// ---------------- Custom Nodes ----------------

function StartNode({ data }: NodeProps) {
    return (
        <div className="flow-node-start">
            <div className="flow-node-label">START</div>
            <div className="flow-node-sublabel">{data.label as string}</div>
            <Handle type="source" position={Position.Right} id="next" className="flow-handle" />
        </div>
    );
}

function EndNode({ data }: NodeProps) {
    const outcome = data.outcome as "success" | "failure";
    return (
        <div className={`flow-node-end ${outcome === "failure" ? "flow-node-end-failure" : ""}`}>
            <Handle type="target" position={Position.Left} id="target" className="flow-handle" />
            <div className="flow-node-label">{outcome === "failure" ? "FAILURE" : "SUCCESS"}</div>
        </div>
    );
}

function PageNode({ data }: NodeProps) {
    return (
        <div className="flow-node-page">
            <Handle type="target" position={Position.Left} id="target" className="flow-handle" />
            <div className="flow-node-icon">📄</div>
            <div className="flow-node-content">
                <div className="flow-node-label">FORM</div>
                <div className="flow-node-title">{data.pageTitle as string ?? "(unnamed)"}</div>
            </div>
            <Handle type="source" position={Position.Right} id="onSubmit" className="flow-handle" />
        </div>
    );
}

function ScriptNode({ data }: NodeProps) {
    return (
        <div className="flow-node-script">
            <Handle type="target" position={Position.Left} id="target" className="flow-handle" />
            <div className="flow-node-icon">⚡</div>
            <div className="flow-node-content">
                <div className="flow-node-label">SCRIPT</div>
                <div className="flow-node-title">{data.scriptName as string ?? "Script"}</div>
            </div>
            <div className="flow-node-handles">
                <Handle
                    type="source"
                    position={Position.Right}
                    id="onSuccess"
                    className="flow-handle flow-handle-success"
                    style={{ top: "30%" }}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="onError"
                    className="flow-handle flow-handle-error"
                    style={{ top: "70%" }}
                />
            </div>
            <div className="flow-handle-labels">
                <span className="flow-handle-label success">✓</span>
                <span className="flow-handle-label error">✗</span>
            </div>
        </div>
    );
}

const nodeTypes = {
    start: StartNode,
    end: EndNode,
    page: PageNode,
    script: ScriptNode,
};

// ---------------- Converters ----------------

function generateId(): string {
    return "step-" + Math.random().toString(36).slice(2, 9);
}

function flowStepsToReactFlow(
    steps: FlowStep[],
    pages: PageDef[],
    scripts: ScriptOption[]
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const step of steps) {
        const pos = step.position ?? { x: 0, y: 0 };

        if (step.type === "start") {
            nodes.push({
                id: step.id,
                type: "start",
                position: pos,
                data: { label: "User enters" },
            });
            if (step.next) {
                edges.push({
                    id: `${step.id}-next`,
                    source: step.id,
                    target: step.next,
                    sourceHandle: "next",
                    markerEnd: { type: MarkerType.ArrowClosed },
                });
            }
        } else if (step.type === "end") {
            nodes.push({
                id: step.id,
                type: "end",
                position: pos,
                data: { outcome: step.outcome },
            });
        } else if (step.type === "page") {
            const page = pages.find((p) => p.id === step.pageId);
            nodes.push({
                id: step.id,
                type: "page",
                position: pos,
                data: { pageId: step.pageId, pageTitle: page?.title ?? step.pageId },
            });
            if (step.onSubmit) {
                edges.push({
                    id: `${step.id}-onSubmit`,
                    source: step.id,
                    target: step.onSubmit,
                    sourceHandle: "onSubmit",
                    markerEnd: { type: MarkerType.ArrowClosed },
                });
            }
        } else if (step.type === "script") {
            const script = scripts.find((s) => s._id === step.scriptId);
            nodes.push({
                id: step.id,
                type: "script",
                position: pos,
                data: { scriptId: step.scriptId, scriptName: script?.name ?? step.scriptId, event: step.event },
            });
            if (step.onSuccess) {
                edges.push({
                    id: `${step.id}-onSuccess`,
                    source: step.id,
                    target: step.onSuccess,
                    sourceHandle: "onSuccess",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: "#22c55e" },
                });
            }
            if (step.onError) {
                edges.push({
                    id: `${step.id}-onError`,
                    source: step.id,
                    target: step.onError,
                    sourceHandle: "onError",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: "#ef4444" },
                });
            }
        }
    }

    return { nodes, edges };
}

function reactFlowToFlowSteps(nodes: Node[], edges: Edge[]): FlowStep[] {
    const steps: FlowStep[] = [];

    for (const node of nodes) {
        const position = { x: node.position.x, y: node.position.y };
        const outgoingEdges = edges.filter((e) => e.source === node.id);

        if (node.type === "start") {
            const nextEdge = outgoingEdges.find((e) => e.sourceHandle === "next");
            steps.push({
                id: node.id,
                type: "start",
                position,
                next: nextEdge?.target,
            } as StartStep);
        } else if (node.type === "end") {
            steps.push({
                id: node.id,
                type: "end",
                position,
                outcome: (node.data.outcome as "success" | "failure") ?? "success",
            } as EndStep);
        } else if (node.type === "page") {
            const onSubmitEdge = outgoingEdges.find((e) => e.sourceHandle === "onSubmit");
            steps.push({
                id: node.id,
                type: "page",
                position,
                pageId: node.data.pageId as string,
                onSubmit: onSubmitEdge?.target,
            } as PageStep);
        } else if (node.type === "script") {
            const onSuccessEdge = outgoingEdges.find((e) => e.sourceHandle === "onSuccess");
            const onErrorEdge = outgoingEdges.find((e) => e.sourceHandle === "onError");
            steps.push({
                id: node.id,
                type: "script",
                position,
                scriptId: node.data.scriptId as string,
                event: (node.data.event as string) ?? "onSubmit",
                onSuccess: onSuccessEdge?.target,
                onError: onErrorEdge?.target,
            } as ScriptStep);
        }
    }

    return steps;
}

// ---------------- Main Component ----------------

export default function DynamicFlowBuilder({
    flow,
    onFlowChange,
    pages,
    availableScripts,
}: {
    flow: FlowStep[];
    onFlowChange: (flow: FlowStep[]) => void;
    pages: PageDef[];
    availableScripts: ScriptOption[];
}) {
    const reactFlowId = useId();

    const initial = useMemo(
        () => flowStepsToReactFlow(flow, pages, availableScripts),
        // Only recompute on flow array identity change
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [flow.length === 0]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

    // Sync flow changes out
    useEffect(() => {
        const newSteps = reactFlowToFlowSteps(nodes, edges);
        onFlowChange(newSteps);
        // Only sync when nodes/edges change (not on onFlowChange ref change)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, edges]);

    const onConnect = useCallback(
        (params: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...params,
                        markerEnd: { type: MarkerType.ArrowClosed },
                        style:
                            params.sourceHandle === "onSuccess"
                                ? { stroke: "#22c55e" }
                                : params.sourceHandle === "onError"
                                    ? { stroke: "#ef4444" }
                                    : undefined,
                    },
                    eds
                )
            );
        },
        [setEdges]
    );

    // Delete edge on click
    const onEdgeClick = useCallback(
        (_event: React.MouseEvent, edge: Edge) => {
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        },
        [setEdges]
    );

    // Add nodes
    function addStartNode() {
        const id = generateId();
        setNodes((nds) => [
            ...nds,
            { id, type: "start", position: { x: 50, y: 150 }, data: { label: "User enters" } },
        ]);
    }

    function addEndNode(outcome: "success" | "failure") {
        const id = generateId();
        setNodes((nds) => [
            ...nds,
            { id, type: "end", position: { x: 800, y: outcome === "success" ? 100 : 250 }, data: { outcome } },
        ]);
    }

    function addPageNode(pageId: string) {
        const page = pages.find((p) => p.id === pageId);
        const id = generateId();
        setNodes((nds) => [
            ...nds,
            {
                id,
                type: "page",
                position: { x: 300, y: 150 + nds.length * 20 },
                data: { pageId, pageTitle: page?.title ?? pageId },
            },
        ]);
    }

    function addScriptNode(scriptId: string) {
        const script = availableScripts.find((s) => s._id === scriptId);
        const id = generateId();
        setNodes((nds) => [
            ...nds,
            {
                id,
                type: "script",
                position: { x: 500, y: 150 + nds.length * 20 },
                data: { scriptId, scriptName: script?.name ?? scriptId, event: "onSubmit" },
            },
        ]);
    }

    const hasStart = nodes.some((n) => n.type === "start");
    const hasSuccessEnd = nodes.some((n) => n.type === "end" && n.data.outcome === "success");
    const hasFailureEnd = nodes.some((n) => n.type === "end" && n.data.outcome === "failure");

    return (
        <div className="dynamic-flow-builder">
            <div className="dynamic-flow-toolbar">
                {!hasStart && (
                    <button type="button" className="btn-flow-add" onClick={addStartNode}>
                        + Start
                    </button>
                )}
                {pages.length > 0 && (
                    <select
                        className="flow-add-select"
                        value=""
                        onChange={(e) => {
                            if (e.target.value) addPageNode(e.target.value);
                        }}
                    >
                        <option value="">+ Add Form</option>
                        {pages.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.title || p.id}
                            </option>
                        ))}
                    </select>
                )}
                {availableScripts.length > 0 && (
                    <select
                        className="flow-add-select"
                        value=""
                        onChange={(e) => {
                            if (e.target.value) addScriptNode(e.target.value);
                        }}
                    >
                        <option value="">+ Add Script</option>
                        {availableScripts.map((s) => (
                            <option key={s._id} value={s._id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                )}
                {!hasSuccessEnd && (
                    <button type="button" className="btn-flow-add btn-flow-success" onClick={() => addEndNode("success")}>
                        + Success End
                    </button>
                )}
                {!hasFailureEnd && (
                    <button type="button" className="btn-flow-add btn-flow-failure" onClick={() => addEndNode("failure")}>
                        + Failure End
                    </button>
                )}
            </div>

            <div className="dynamic-flow-canvas">
                <ReactFlow
                    id={reactFlowId}
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgeClick={onEdgeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    defaultEdgeOptions={{
                        markerEnd: { type: MarkerType.ArrowClosed },
                    }}
                >
                    <Controls />
                    <Background gap={16} size={1} />
                </ReactFlow>
            </div>

            <p className="dynamic-flow-hint">
                Drag nodes to position. Connect handles: Form → onSubmit, Script → Success (✓) or Error (✗).
            </p>
        </div>
    );
}
