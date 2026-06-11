export function TypingIndicator() {
  return (
    <div className="inline-flex items-center gap-1.5 bg-kubernaut-teal-50 rounded-full px-4 py-2">
      <span className="w-2 h-2 rounded-full bg-kubernaut-teal-600 typing-dot" />
      <span className="w-2 h-2 rounded-full bg-kubernaut-teal-600 typing-dot" />
      <span className="w-2 h-2 rounded-full bg-kubernaut-teal-600 typing-dot" />
    </div>
  );
}
