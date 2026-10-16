
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Controller from "./Controller.jsx";
import "./index.css";

const isController = window.location.pathname.replace(/\/+$/, "") === "/controller";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isController ? <Controller /> : <App />}
  </React.StrictMode>
);
