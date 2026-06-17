import { jsx as _jsx } from "react/jsx-runtime";
import { ChatContainer, ErrorBoundary } from "@kubernaut/ui-core";
function App() {
    return (_jsx("div", { className: "flex h-screen items-center justify-center bg-surface p-0 sm:p-4", children: _jsx("div", { className: "h-full w-full sm:h-[750px] sm:max-w-[820px]", children: _jsx(ErrorBoundary, { children: _jsx(ChatContainer, {}) }) }) }));
}
export default App;
