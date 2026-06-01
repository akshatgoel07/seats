import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export const createTourDriver = () => {
  return driver({
    showProgress: true,
    showButtons: ["next", "previous", "close"],
    overlayColor: "rgba(0, 0, 0, 0.5)",
    smoothScroll: true,
    allowClose: true,
    disableActiveInteraction: false,
    popoverOffset: 10,
    stagePadding: 8,
    stageRadius: 8,
    steps: [
      {
        element: "#editor-layout",
        popover: {
          title: "Welcome to the Seat Layout Editor",
          description:
            "This tour will guide you through all the essential tools and features to help you create professional seat layouts. Let's get started!",
          side: /** @type {any} */ ("center"),
          align: "center",
        },
      },
      {
        element: "[data-toolbar]",
        popover: {
          title: "Drawing Tools",
          description:
            "Your main toolkit for creating seat layouts. Here you'll find tools for drawing rows, placing seats, adding shapes, and more. Each tool has a keyboard shortcut shown in parentheses.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="select"]',
        popover: {
          title: "Select Tool (S)",
          description:
            "Use this to select and move elements. Hold Shift to select multiple items, or Alt+Click on a seat to select the entire row.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="pan"]',
        popover: {
          title: "Pan Tool (Space)",
          description:
            "Navigate around your canvas by dragging. You can also hold the spacebar while using other tools to temporarily activate pan mode.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="rowLine"]',
        popover: {
          title: "Row Line Tool (R)",
          description:
            "Create straight rows of seats. Click and drag to define the row length, then adjust the number of seats and spacing in the properties panel.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="rowArc"]',
        popover: {
          title: "Row Arc Tool (A)",
          description:
            "Create curved rows of seats, perfect for theaters and auditoriums. Draw an arc to define the curve, and adjust the seat count and spacing as needed.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="seat"]',
        popover: {
          title: "Seat Tool (E)",
          description:
            "Place individual seats one at a time. Useful for adding extra seats or creating custom arrangements outside of standard rows.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="table"]',
        popover: {
          title: "Table Tool (B)",
          description:
            "Create tables with seats automatically arranged around them. Great for banquet-style seating or dining venues.",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-canvas-stage]",
        popover: {
          title: "Canvas Area",
          description:
            "Your main working area where you draw and arrange your seat layout. Use the mouse wheel to zoom in and out, and toggle the grid (G) for precise alignment.",
          side: "left",
          align: "center",
        },
      },
      {
        element: '[data-tool="grid"]',
        popover: {
          title: "Grid Toggle (G)",
          description:
            "Show or hide the alignment grid. The grid helps you position elements precisely and maintain consistent spacing throughout your layout.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="circle"]',
        popover: {
          title: "Shape Tools",
          description:
            "Use Circle (C), Rectangle (T), and Path (P) tools to add decorative elements, boundaries, or stage areas to your layout.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="text"]',
        popover: {
          title: "Text Tool (X)",
          description:
            "Add labels, section names, or notes to your layout. Customize font, size, and color in the properties panel.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="image"]',
        popover: {
          title: "Image Upload (I)",
          description:
            "Import floor plans, logos, or background images. You can lock images to prevent accidental movement while working.",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-properties-panel]",
        popover: {
          title: "Properties Panel",
          description:
            "Edit the selected element's properties here. Adjust positions, sizes, colors, seat categories, and more. The panel changes based on what you have selected.",
          side: "left",
          align: "start",
        },
      },
      {
        element: '[data-save-button="true"]',
        popover: {
          title: "Save Your Work",
          description:
            "Click here to save your layout. The number in parentheses shows your current seat count. Remember to save frequently!",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: '[data-tool="shortcuts"]',
        popover: {
          title: "Keyboard Shortcuts",
          description:
            "Access the complete list of keyboard shortcuts here. Learning these shortcuts will speed up your workflow significantly!",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tool="undo"]',
        popover: {
          title: "Undo & Redo",
          description:
            "Made a mistake? Use Undo (Ctrl+Z) and Redo (Ctrl+Y) to step backward or forward through your changes.",
          side: "right",
          align: "end",
        },
      },
      {
        popover: {
          title: "You're All Set!",
          description:
            "You now know the essential tools to create professional seat layouts. Start designing, and remember you can always restart this tour from the Tour button in the top bar. Happy designing!",
          side: /** @type {any} */ ("center"),
          align: "center",
        },
      },
    ],
    // Custom styling to match design system
    popoverClass: "tour-popover",
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Previous",
    doneBtnText: "Done",
  });
};

// Custom CSS styling
export const tourStyles = `
  .driver-popover {
    background-color: white;
    color: #1f2937;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    z-index: 10002 !important;
  }

  .driver-popover-title {
    font-size: 18px;
    font-weight: 600;
    color: #111827;
  }

  .driver-popover-description {
    font-size: 14px;
    line-height: 1.5;
    color: #4b5563;
  }

  .driver-popover-progress-text {
    font-size: 12px;
    color: #6b7280;
  }

  .driver-popover-navigation-btns {
    gap: 8px;
  }

  .driver-popover-btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    border: none;
  }

  .driver-popover-next-btn,
  .driver-popover-close-btn {
    background-color: white;
    color: #374151;
  }

  .driver-popover-next-btn:hover,
  .driver-popover-close-btn:hover {
    background-color: #e5e7eb;
  }

  .driver-popover-prev-btn {
    background-color: white;
    color: #374151;
  }

  .driver-popover-prev-btn:hover {
    // background-color: #f3f4f6;
  }

  .driver-overlay {
    background-color: rgba(0, 0, 0, 0.5) !important;
    z-index: 10000 !important;
  }

  .driver-active-element {
    border-radius: 8px !important;
    z-index: 10001 !important;
    box-shadow: 0 0 0 4px #2346DD, 0 0 0 8px rgba(35, 70, 221, 0.3) !important;
  }

  /* Ensure highlighted elements appear above overlay */
  .driver-highlighted-element {
    z-index: 10001 !important;
  }

  /* Special handling for fixed positioned elements */
  [data-toolbar].driver-active-element,
  [data-properties-panel].driver-active-element {
    z-index: 10001 !important;
    box-shadow: 0 0 0 4px #2346DD !important;
  }

  /* Individual tool buttons - don't override background, just add ring */
  button[data-tool].driver-active-element {
    z-index: 10001 !important;
    outline: 4px solid #2346DD !important;
    outline-offset: 4px !important;
    box-shadow: 0 0 20px rgba(35, 70, 221, 0.6) !important;
  }
`;
