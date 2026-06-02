import { redirect } from "next/navigation";

// Route cũ /demo được giữ để không gãy link, nhưng dashboard chính hiện nằm ở trang "/".
export default function DemoRedirect() {
  redirect("/");
}
