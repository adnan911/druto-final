// Ledger Light reminder: editorial Swiss structure, warm white surfaces, graphite text, cobalt actions, Druto Sea Glass finality, and restrained motion.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import DeveloperHub from "./pages/DeveloperHub";
import StartWithDruto from "./pages/StartWithDruto";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/developers" component={DeveloperHub} />
            <Route path="/developers/start" component={StartWithDruto} />
            <Route path="/dashboard" component={Home} />
            <Route path="/checkout/:session" component={Home} />
            <Route path="/receipt/:session" component={Home} />
            <Route path="/payments" component={Home} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
