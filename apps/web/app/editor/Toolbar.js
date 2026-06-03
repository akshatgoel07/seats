"use client";

import React, { useState } from "react";
import { useEditor } from "./EditorContext.js";
import {
  TOOL_TYPES,
  ELEMENT_TYPES,
  createRow,
  createLineGeometry,
  createArcGeometry,
  createElement,
  createSeat,
  getNextTableLabel,
} from "./types.js";
import ShortcutsModal from "./components/ShortcutsModal.js";
import Tooltip from "./components/Tooltip.js";
import {
  Hand,
  MousePointer2,
  RotateCcwSquare,
  RotateCwSquare,
  ImageUp,
  Ruler,
} from "lucide-react";
import Image from "next/image.js";
import RowLineIcon from "../../public/icons/row.svg";
import RowArcIcon from "../../public/icons/arc.svg";
import RowSeatIcon from "../../public/icons/seat.svg";
import { showToast } from "@/app/lib/toast";

const ToolButton = ({
  tool,
  currentTool,
  onClick,
  children,
  shortcut,
  tooltipLabel,
  dataTool,
}) => {
  const isActive = currentTool === tool;

  return (
    <Tooltip
      content={
        <span>
          {tooltipLabel || tool.replace("-", " ")}{" "}
          <span className="opacity-70">({shortcut})</span>
        </span>
      }
      position="right"
    >
      <button
        data-tool={dataTool}
        onClick={() => onClick(tool)}
        className={`
        w-12 h-12 flex items-center justify-center rounded-lg border-[.5px] transition-colors
        ${
          isActive
            ? "bg-[#7F56D9]/80 border-[#0A0D120D] text-white"
            : "bg-white border-[#00000012] text-gray-700 hover:bg-gray-50 hover:border-gray-400"
        }
      `}
      >
        {children}
      </button>
    </Tooltip>
  );
};

export default function Toolbar() {
  const { state, actions } = useEditor();
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Keyboard shortcuts for the modal
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd + / or Ctrl + / to open modal
      if ((e.metaKey || e.ctrlKey) && e.key === "/" && !isShortcutsModalOpen) {
        e.preventDefault();
        setIsShortcutsModalOpen(true);
      }
      // Escape to close modal
      else if (e.key === "Escape" && isShortcutsModalOpen) {
        e.preventDefault();
        setIsShortcutsModalOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isShortcutsModalOpen]);

  const handleAddStraightRow = () => {
    const sectionId = actions.ensureSectionExists();
    const geometry = createLineGeometry(100, 100, 300, 100);
    const toolSettings = state.toolSettings[TOOL_TYPES.ROW_LINE] || {};
    const { defaultSeatCount } = state.globalSettings;
    const seatSpacing =
      toolSettings.seatSpacing || state.globalSettings.seatSpacing;
    const categoryId =
      toolSettings.categoryId || state.globalSettings.categoryId || "default";
    const row = createRow(
      sectionId,
      geometry,
      defaultSeatCount,
      seatSpacing,
      categoryId,
      0,
    );
    actions.addRow(row);
  };

  const handleAddCurvedRow = () => {
    const sectionId = actions.ensureSectionExists();
    const geometry = createArcGeometry(
      200,
      200,
      150,
      -Math.PI / 4,
      Math.PI / 4,
    );
    const toolSettings = state.toolSettings[TOOL_TYPES.ROW_ARC] || {};
    const { defaultSeatCount } = state.globalSettings;
    const seatSpacing =
      toolSettings.seatSpacing || state.globalSettings.seatSpacing;
    const categoryId =
      toolSettings.categoryId || state.globalSettings.categoryId || "default";
    const row = createRow(
      sectionId,
      geometry,
      defaultSeatCount,
      seatSpacing,
      categoryId,
      0,
    );
    actions.addRow(row);
  };

  const handleAddTable = () => {
    const sectionId = actions.ensureSectionExists();
    const tableRadius = 30; // Table radius (60px diameter)
    const seatRadius = 39; // Distance from center to seat center (closer to table)
    const tableX = 400;
    const tableY = 300;

    // Create the table (circle element) without automatic labeling
    const table = createElement(
      ELEMENT_TYPES.CIRCLE,
      tableX,
      tableY,
      tableRadius * 2,
      tableRadius * 2,
      {
        fillColor: "#fef3c7",
        strokeColor: "#d97706",
        strokeWidth: 2,
        label: "Table", // Default label, will be updated by auto-assign
      },
    );

    // Add the table element
    actions.addElement(table);

    // Create 10 seats around the table
    const seats = [];
    const seatSpacing = (2 * Math.PI) / 10; // 10 seats equally spaced around circle

    for (let i = 0; i < 10; i++) {
      const angle = i * seatSpacing;
      const seatX = tableX + seatRadius * Math.cos(angle);
      const seatY = tableY + seatRadius * Math.sin(angle);

      const seat = createSeat(
        null, // No rowId for table seats
        seatX,
        seatY,
        `Seat ${i + 1}`, // Default label, will be updated by auto-assign
        state.scene.venue.categories[0]?.id || "default",
        12,
        12,
      );
      seats.push(seat);
    }

    // Add all seats
    seats.forEach((seat) => {
      actions.addSeat(seat);
    });

    // Select the table and seats
    actions.setSelection([table.id, ...seats.map((s) => s.id)]);
  };

  const handleAddRectangle = () => {
    const rectangle = createElement(
      ELEMENT_TYPES.RECTANGLE,
      500,
      300,
      120,
      80,
      {
        fillColor: "#dbeafe",
        strokeColor: "#3b82f6",
        label: "",
      },
    );
    actions.addElement(rectangle);
  };

  const handleAddBoundaryLine = () => {
    actions.setTool("element-path");
    // The canvas will handle creating the boundary line with proper styling
  };

  const handleAddSectionBoundary = () => {
    // Create a curved boundary around a section
    const boundaryPoints = [
      { x: 200, y: 200 },
      { x: 400, y: 180 },
      { x: 600, y: 200 },
      { x: 700, y: 300 },
      { x: 600, y: 400 },
      { x: 400, y: 420 },
      { x: 200, y: 400 },
      { x: 100, y: 300 },
      { x: 200, y: 200 }, // Close the loop
    ];

    const boundary = createElement(ELEMENT_TYPES.PATH, 0, 0, 0, 0, {
      points: boundaryPoints,
      strokeColor: "rgba(0, 0, 0, 0.9)",
      strokeWidth: 2,
      label: "Section Boundary",
      opacity: 0.8,
    });

    actions.addElement(boundary);
    actions.setSelection([boundary.id]);
  };

  const handleConvertToSectionBoundary = () => {
    // Convert selected path elements to section boundaries
    const selectedElements = state.selectedIds
      .map((id) => state.scene.elements[id])
      .filter((element) => element && element.type === ELEMENT_TYPES.PATH);

    if (selectedElements.length === 0) {
      // alert("Please select one or more path elements to convert.");
      showToast("Please select one or more path elements to convert.", "");
      return;
    }

    selectedElements.forEach((element) => {
      // Check if path is closed
      if (element.points && element.points.length >= 3) {
        const firstPoint = element.points[0];
        const lastPoint = element.points[element.points.length - 1];
        const distance = Math.sqrt(
          Math.pow(lastPoint.x - firstPoint.x, 2) +
            Math.pow(lastPoint.y - firstPoint.y, 2),
        );
        const isClosed = distance < 20; // 20 pixel threshold for closure

        if (isClosed) {
          // Create section boundary element
          const sectionBoundary = createElement(
            ELEMENT_TYPES.SECTION_BOUNDARY,
            0,
            0,
            0,
            0,
            {
              points: element.points,
              curveHandles: element.curveHandles || {},
              strokeColor: element.strokeColor || "rgba(0, 0, 0, 0.9)",
              strokeWidth: element.strokeWidth || 2,
              fillColor: "rgba(0, 0, 0, 0.1)",
              label: "Section Boundary",
              sectionName: `Section ${
                Object.keys(state.scene.sections).length + 1
              }`,
              categoryId: "default",
              opacity: element.opacity || 0.8,
              showAsSolid: true,
              zoomThreshold: 0.5,
            },
          );

          // Remove original path and add section boundary
          actions.deleteItems([element.id]);
          actions.addElement(sectionBoundary);
        }
      }
    });

    // Clear selection after conversion
    actions.clearSelection();
  };

  const handleAddStandingSection = () => {
    const toolSettings = state.toolSettings[TOOL_TYPES.STANDING_SECTION] || {};
    const standingSection = createElement(
      ELEMENT_TYPES.STANDING_SECTION,
      400,
      300,
      toolSettings.width || 150,
      toolSettings.height || 100,
      {
        standingCapacity: toolSettings.standingCapacity || 50,
        sectionType: toolSettings.sectionType || "general",
        fillColor: toolSettings.fillColor || "#e5e7eb",
        strokeColor: toolSettings.strokeColor || "transparent",
        strokeWidth: toolSettings.strokeWidth || 0,
        opacity: toolSettings.opacity || 1.0,
        label: toolSettings.label || "Standing Section",
      },
    );
    actions.addElement(standingSection);
    actions.setSelection([standingSection.id]);
  };

  return (
    <div data-toolbar className="select-none shadow-2xl hide-scrollbar fixed left-0 top-16 m-5 rounded-lg bottom-0 z-40 px-3  border border-[#E9EAEB] bg-[#FAFAFA] flex flex-col items-center py-4 gap-2 overflow-y-auto overscroll-contain">
      {/* Selection Tools */}
      <div className="flex flex-col gap-2 pb-2">
        <ToolButton
          tool={TOOL_TYPES.SELECT}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="S"
          tooltipLabel="Select tool"
          dataTool="select"
        >
          <MousePointer2 size={20} />
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.PAN}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="Space"
          tooltipLabel="Pan tool"
          dataTool="pan"
        >
          <Hand strokeWidth={1} />
        </ToolButton>
      </div>

      {/* Row Creation Tools */}
      <div className="flex flex-col gap-2 pb-4 border-b border-gray-300">
        <ToolButton
          tool={TOOL_TYPES.ROW_LINE}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="R"
          tooltipLabel="Row line"
          dataTool="rowLine"
        >
          <Image src={RowLineIcon} alt="Row Line" width={32} height={32} />
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.ROW_ARC}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="A"
          tooltipLabel="Row arc"
          dataTool="rowArc"
        >
          <Image src={RowArcIcon} alt="Row Arc" width={32} height={32} />
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.MULTI_ROW}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="M"
          tooltipLabel="Multi-row"
          dataTool="multiRow"
        >
          <Image src={RowLineIcon} alt="Multi Row" width={32} height={32} />
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.SEAT}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="E"
          tooltipLabel="Seat"
          dataTool="seat"
        >
          <Image src={RowSeatIcon} alt="Row Seat" width={32} height={32} />
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.ELEMENT_TABLE}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="B"
          tooltipLabel="Table"
          dataTool="table"
        >
          <Image src={"/icons/table.svg"} alt="Table" width={32} height={32} />
        </ToolButton>
      </div>

      {/* Element Creation Tools */}
      <div className="flex flex-col gap-2 pb-2 border-b border-gray-300">
        <ToolButton
          tool={TOOL_TYPES.ELEMENT_CIRCLE}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="C"
          tooltipLabel="Circle"
          dataTool="circle"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="8"
              cy="8"
              r="7.25"
              fill="#F1F1F1"
              stroke="black"
              strokeWidth="0.5"
            />
          </svg>
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.ELEMENT_RECTANGLE}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="T"
          tooltipLabel="Rectangle"
          dataTool="rectangle"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="0.75"
              y="0.75"
              width="14.5"
              height="14.5"
              rx="2.75"
              fill="#F1F1F1"
              stroke="black"
              strokeWidth="0.5"
            />
          </svg>
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.ELEMENT_PATH}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="P"
          tooltipLabel="Path"
          dataTool="path"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10.3169 13.8081C10.1997 13.9253 10.0407 13.9911 9.875 13.9911C9.70927 13.9911 9.55033 13.9253 9.43312 13.8081L8.44187 12.8169C8.3247 12.6997 8.25888 12.5407 8.25888 12.375C8.25888 12.2093 8.3247 12.0503 8.44187 11.9331L11.9331 8.44187C12.0503 8.3247 12.2093 8.25888 12.375 8.25888C12.5407 8.25888 12.6997 8.3247 12.8169 8.44187L13.8081 9.43312C13.9253 9.55033 13.9911 9.70927 13.9911 9.875C13.9911 10.0407 13.9253 10.1997 13.8081 10.3169L10.3169 13.8081Z"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11.75 8.625L10.8906 4.32875C10.8673 4.21187 10.8109 4.1041 10.7283 4.01817C10.6457 3.93223 10.5403 3.87172 10.4244 3.84375L2.52188 1.7675C2.41777 1.74233 2.30894 1.74434 2.20583 1.77333C2.10272 1.80232 2.00879 1.85732 1.93306 1.93306C1.85732 2.00879 1.80232 2.10272 1.77333 2.20583C1.74434 2.30894 1.74233 2.41777 1.7675 2.52188L3.84375 10.4244C3.87172 10.5403 3.93223 10.6457 4.01817 10.7283C4.1041 10.8109 4.21187 10.8673 4.32875 10.8906L8.625 11.75"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1.9375 1.9375L6.49125 6.49125"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7.375 8.625C8.06536 8.625 8.625 8.06536 8.625 7.375C8.625 6.68464 8.06536 6.125 7.375 6.125C6.68464 6.125 6.125 6.68464 6.125 7.375C6.125 8.06536 6.68464 8.625 7.375 8.625Z"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.ELEMENT_TEXT}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="X"
          tooltipLabel="Text"
          dataTool="text"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="0.75"
              y="0.75"
              width="14.5"
              height="14.5"
              rx="1.75"
              stroke="black"
              strokeWidth="0.5"
            />
            <path
              d="M8 5.33334V10.6667"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.33334 6.33334V5.66668C5.33334 5.57827 5.36846 5.49349 5.43097 5.43097C5.49349 5.36846 5.57827 5.33334 5.66668 5.33334H10.3333C10.4217 5.33334 10.5065 5.36846 10.569 5.43097C10.6316 5.49349 10.6667 5.57827 10.6667 5.66668V6.33334"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.5 10.6667H9.5"
              stroke="black"
              strokeWidth="0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.IMAGE_UPLOAD}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="I"
          tooltipLabel="Image Upload"
          dataTool="image"
        >
          <ImageUp size={24} strokeWidth={1} />
        </ToolButton>

        <ToolButton
          tool={TOOL_TYPES.MEASURE}
          currentTool={state.currentTool}
          onClick={actions.setTool}
          shortcut="D"
          tooltipLabel="Measure Distance"
          dataTool="measure"
        >
          <Ruler size={24} strokeWidth={1} />
        </ToolButton>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2 pt-2">
        <Tooltip
          content={
            <span>
              Toggle Grid <span className="opacity-70">(G)</span>
            </span>
          }
          position="right"
        >
          <button
            data-tool="grid"
            onClick={actions.toggleGrid}
            className={`w-12 h-12 rounded-lg border-[1px] transition-colors flex items-center justify-center text-xl ${
              state.isGridVisible
                ? "bg-blue-100 border-blue-500 hover:bg-blue-200 hover:border-blue-600"
                : "bg-white border-[#000000]/25 hover:bg-gray-50 hover:border-gray-400"
            }`}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="2"
                y="2"
                width="20"
                height="20"
                rx="2"
                fill="#F1F1F1"
                stroke="black"
                strokeWidth="0.5"
              />
              <line
                x1="2"
                y1="6"
                x2="22"
                y2="6"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="2"
                y1="10"
                x2="22"
                y2="10"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="2"
                y1="14"
                x2="22"
                y2="14"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="2"
                y1="18"
                x2="22"
                y2="18"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="6"
                y1="2"
                x2="6"
                y2="22"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="10"
                y1="2"
                x2="10"
                y2="22"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="14"
                y1="2"
                x2="14"
                y2="22"
                stroke="black"
                strokeWidth="0.3"
              />
              <line
                x1="18"
                y1="2"
                x2="18"
                y2="22"
                stroke="black"
                strokeWidth="0.3"
              />
            </svg>
          </button>
        </Tooltip>

        <Tooltip content="Keyboard Shortcuts" position="right">
          <button
            data-tool="shortcuts"
            onClick={() => setIsShortcutsModalOpen(true)}
            className="w-12 h-12 bg-white text-white rounded-lg border-[.5px] border-[#00000012] hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center justify-center text-xl"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6.75 5.5H6.75625"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 8H8.00625"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.25 5.5H9.25625"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.5 8H10.5063"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M11.75 5.5H11.7563"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4.25 5.5H4.25625"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4.875 10.5H11.125"
                stroke="black"
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 8H5.50625"
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13 3H3C2.30964 3 1.75 3.55964 1.75 4.25V11.75C1.75 12.4404 2.30964 13 3 13H13C13.6904 13 14.25 12.4404 14.25 11.75V4.25C14.25 3.55964 13.6904 3 13 3Z"
                stroke="black"
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* Rotation Controls */}
      {/* {state.selectedIds.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-300">
          <button
            onClick={() => actions.rotateSelectedSeats(-Math.PI / 12)}
            className="w-12 h-12 bg-purple text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center text-xl"
            style={{ backgroundColor: "#8d6fbf" }}
            title="Rotate Counter-Clockwise ([)"
          >
            <RotateCcwSquare strokeWidth={1} />
          </button>

          <button
            onClick={() => actions.rotateSelectedSeats(Math.PI / 12)}
            className="w-12 h-12 bg-purple text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center text-xl"
            style={{ backgroundColor: "#8d6fbf" }}
            title="Rotate Clockwise (])"
          >
            ↷
          </button>
        </div>
      )} */}

      {/* Undo/Redo */}
      <div className="flex flex-col gap-2 pt-4 mt-auto">
        <Tooltip
          content={
            <span>
              Undo <span className="opacity-70">(Ctrl+Z)</span>
            </span>
          }
          position="right"
        >
          <button
            data-tool="undo"
            onClick={actions.undo}
            disabled={state.historyIndex <= 0}
            className="w-12 h-12 bg-white text-black rounded-lg border-[.5px] border-[#00000012] hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center justify-center disabled:cursor-not-allowed text-xl"
          >
            <RotateCcwSquare strokeWidth={1} />
          </button>
        </Tooltip>

        <Tooltip
          content={
            <span>
              Redo <span className="opacity-70">(Ctrl+Y)</span>
            </span>
          }
          position="right"
        >
          <button
            data-tool="redo"
            onClick={actions.redo}
            disabled={state.historyIndex >= state.history.length - 1}
            className="w-12 h-12 bg-white text-black rounded-lg border-[.5px] border-[#00000012] hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center justify-center disabled:cursor-not-allowed text-xl"
          >
            <RotateCwSquare strokeWidth={1} />
          </button>
        </Tooltip>
      </div>

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
}
