import { ChatContainer } from "./components/ChatContainer";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface p-0 sm:p-4">
      <div className="h-full w-full sm:h-[750px] sm:max-w-[820px]">
        <ErrorBoundary>
          <ChatContainer />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
