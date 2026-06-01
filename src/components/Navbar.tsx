import { Button } from "@/components/ui/button";
import { Bird } from "lucide-react";
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Bird className="h-7 w-7 text-primary" />
          <span className="font-display text-xl font-bold tracking-tight">Donebird</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Özellikler</a>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Nasıl Çalışır</a>
          <a href="#insights" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Analizler</a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth"><Button variant="ghost" size="sm">Giriş Yap</Button></Link>
          <Link to="/auth"><Button variant="hero" size="sm">Başla</Button></Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
