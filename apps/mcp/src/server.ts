import { registerBookmarkTools } from "./bookmarks";
import { registerListTools } from "./lists";
import { createKarakeepMcpContext } from "./shared";
import { registerTagTools } from "./tags";
import { registerKarakeepWidgetTools } from "./widget";

export const createMcpServer = () => {
  const context = createKarakeepMcpContext();

  registerBookmarkTools(context);
  registerListTools(context);
  registerTagTools(context);
  registerKarakeepWidgetTools(context);

  return context.mcpServer;
};
