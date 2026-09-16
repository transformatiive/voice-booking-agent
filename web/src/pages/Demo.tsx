import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { VoiceSession, type VoicePhase } from "@/lib/voice-call";

export function Demo() {
  const { slug = "clinica-central" } = useParams();
  const [name, setName] = useState(slug);
  const [agentName, setAgentName] = useState("Atende");
  const [gptLive, setGptLive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [caption, setCaption] = useState("Toque em Iniciar chamada ou ligue 21 021 0260.");
  const session = useMemo(
    () =>
      new VoiceSession({
        slug,
        agentName: "Atende",
        onPhase: setPhase,
        onCaption: (_who, text) => setCaption(text),
      }),
    [slug],
  );

  useEffect(() => {
    void fetch(`/api/business/${slug}`)
      .then((res) => res.json())
      .then((payload: { business: { name: string; agentName: string }; features: { gptLive?: boolean } }) => {
        setName(payload.business.name);
        setAgentName(payload.business.agentName || "Atende");
        setGptLive(Boolean(payload.features.gptLive));
        session.setGptLive(Boolean(payload.features.gptLive));
        session.setSlug(slug);
      })
      .catch(() => undefined);
  }, [session, slug]);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 px-6 py-10">
      <Link to="/" className="text-sm text-muted-foreground">
        Atende
      </Link>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{name}</CardTitle>
              <CardDescription>{agentName} · gpt-live-1</CardDescription>
            </div>
            <Badge variant="secondary">{phase}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p>{caption}</p>
        </CardContent>
        <CardFooter className="flex gap-2">
          {phase === "live" || phase === "connecting" ? (
            <Button variant="destructive" onClick={() => void session.hangup()}>
              Terminar
            </Button>
          ) : (
            <Button disabled={!gptLive && phase === "blocked"} onClick={() => void session.startCall()}>
              Iniciar chamada
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
