import { App } from "./ui/App";
import "./styles/app.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app fehlt");
new App(root);
