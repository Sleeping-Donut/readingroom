import type { Component } from "solid-js";
import { Route, Router } from "@solidjs/router";
import { Authors } from "./routes/Authors";
import { AuthorDetail } from "./routes/AuthorDetail";
import { Books } from "./routes/Books";
import { Dashboard } from "./routes/Dashboard";
import { Layout } from "./components/Layout";

const App: Component = () => {
  return (
    <Router root={Layout}>
      <Route path="/" component={Dashboard} />
      <Route path="/authors" component={Authors} />
      <Route path="/authors/:id" component={AuthorDetail} />
      <Route path="/books" component={Books} />
    </Router>
  );
};

export default App;
