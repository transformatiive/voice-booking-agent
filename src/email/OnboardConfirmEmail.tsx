import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

export interface OnboardConfirmEmailProps {
  businessName: string;
  agentName: string;
  backofficeUrl: string;
}

export function OnboardConfirmEmail({
  businessName,
  agentName,
  backofficeUrl,
}: OnboardConfirmEmailProps) {
  return (
    <Html lang="pt" dir="ltr">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                ink: "#0e1a24",
                body: "#47586a",
                brand: "#1f8a6e",
                surface: "#f6f8fa",
              },
            },
          },
        }}
      >
        <Head />
        <Body className="bg-surface font-sans">
          <Preview>O backoffice já está disponível. O número fica ativo em cerca de 2 dias úteis.</Preview>
          <Container className="mx-auto p-6">
            <Heading as="h1" className="m-0 text-2xl font-bold text-ink">
              A sua conta Atende está pronta
            </Heading>
            <Text className="mt-4 text-base leading-6 text-body">
              Olá. A conta de {businessName} ficou criada e o assistente {agentName} já pode ser
              configurado. Não precisa de esperar pelo número para usar o resto do backoffice.
            </Text>
            <Section className="mt-2">
              <Text className="m-0 text-base font-bold text-ink">O que acontece a seguir</Text>
              <Text className="mt-2 text-base leading-6 text-body">
                A Transformatiive atribui e liga o +351 via Telnyx. Isso costuma levar cerca de 2
                dias úteis até a linha estar publicada. A aprovação regulatória, se existir, corre
                do nosso lado — muitas vezes nem é necessária.
              </Text>
              <Text className="mt-2 text-base leading-6 text-body">
                Entretanto já pode tratar da agenda, recursos, serviços, horários, assistente e
                faturação. O número só passa a atender chamadas quando estiver ativo.
              </Text>
            </Section>
            <Section className="mt-6">
              <Button
                href={backofficeUrl}
                className="box-border rounded-full bg-brand px-6 py-3 text-center text-base font-bold text-white no-underline"
              >
                Abrir o backoffice
              </Button>
            </Section>
            <Hr className="mt-8 border-solid border-[#e4eaf0]" />
            <Text className="text-sm leading-5 text-body">
              Atende · Transformatiive. Se não pediu esta conta, ignore este email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

OnboardConfirmEmail.PreviewProps = {
  businessName: "Clínica Esperança",
  agentName: "Atende",
  backofficeUrl: "https://voice-booking-agent-production-c728.up.railway.app/app/clinica-esperanca",
} satisfies OnboardConfirmEmailProps;
