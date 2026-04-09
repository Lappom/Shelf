import { requireUser } from "@/lib/auth/rbac";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default async function UiShowcasePage() {
  await requireUser();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-10">
      <header className="space-y-3">
        <p className="text-eleven-muted text-xs tracking-widest uppercase">UI Kit</p>
        <h1 className="eleven-display-hero text-4xl">Surface, type, and whisper-level depth.</h1>
        <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-[1.05rem] leading-relaxed">
          Cette page sert de référence visuelle pour valider les tokens, la typographie Waldenburg
          300, les ombres multi-couches et les boutons pilule.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Variants ElevenLabs + tailles.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="blackPill">Black pill</Button>
            <Button variant="whitePill">White pill</Button>
            <Button variant="warmStone" size="warm">
              Warm stone
            </Button>
            <Button variant="uppercaseCta">Get started</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </CardContent>
          <CardFooter className="text-eleven-muted text-xs">
            Tip: utilisez <code className="font-mono">size=&quot;warm&quot;</code> pour la pill
            warm-stone.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Tracking aéré + focus ring.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Email" type="email" />
            <Input placeholder="Search…" />
          </CardContent>
          <CardFooter className="text-eleven-muted text-xs">
            Les placeholders doivent rester légers, jamais gris froid.
          </CardFooter>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dropdown menu</CardTitle>
            <CardDescription>Surface flottante “shadow-as-border”.</CardDescription>
          </CardHeader>
          <CardContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="whitePill">Open menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel className="text-eleven-muted">Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuItem>Share</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dialog</CardTitle>
            <CardDescription>Overlay doux + panneau sculpté.</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="warmStone" size="warm">
                  Open dialog
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Écoute attentive</DialogTitle>
                  <DialogDescription className="text-eleven-secondary eleven-body-airy">
                    Des surfaces presque invisibles, définies par des ombres à très faible opacité.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p className="text-eleven-secondary eleven-body-airy text-sm leading-relaxed">
                    Ce contenu valide la typo headings + l’outline subtil + la cohérence des rayons.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button variant="blackPill">Confirm</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
