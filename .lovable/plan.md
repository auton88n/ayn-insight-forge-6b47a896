

# Speed Up Chat Input Sidebar Transition

The sidebar itself animates at 200ms, but the chat input area and content use 300ms — creating a noticeable delay where the input "catches up" to the sidebar.

## Changes

### 1. `src/components/dashboard/CenterStageLayout.tsx`
- **Line 633**: Change `transition-all duration-300` to `duration-200` on the content scroll area
- **Line 743**: Change `transition-all duration-300` to `duration-200` on the fixed footer/chat input wrapper

### 2. `src/components/dashboard/ChatInput.tsx`
- **Line 397**: Change `transition-[padding] duration-300` to `duration-200` on the chat input root div

All three will now match the sidebar's 200ms timing for a synchronized animation.

