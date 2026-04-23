import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Container, Title, Table, Text, Paper, Badge, Code, ScrollArea } from '@mantine/core'

export const Route = createFileRoute('/admin/audit')({
  component: AdminAudit,
})

function AdminAudit() {
  const events = useQuery(api.admin.audit.listAuditEvents)

  return (
    <Container size="xl" py={48}>
      <Paper
        radius="lg"
        p="xl"
        mb={40}
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.12) 0%, rgba(84, 116, 180, 0.04) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Title order={1} fz={36} fw={600} c="white">
          Audit Log
        </Title>
        <Text size="lg" c="dark.2" mt={8}>
          Admin actions — most recent 100 events.
        </Text>
      </Paper>

      {events === undefined ? (
        <Text c="dark.3">Loading…</Text>
      ) : events.length === 0 ? (
        <Text c="dark.3">No audit events yet.</Text>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                <Table.Th>Admin</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Target User</Table.Th>
                <Table.Th>Target ID</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {events.map((e) => (
                <Table.Tr key={e._id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    <Text size="xs" c="dark.2">
                      {new Date(e.at).toLocaleString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace" c="blue.4">
                      {e.adminUserId}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="brand" size="sm">
                      {e.action}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace" c="dark.2">
                      {e.targetUserId ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace" c="dark.2">
                      {e.targetId ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {e.details != null ? (
                      <Code block style={{ maxWidth: 300, fontSize: 11 }}>
                        {JSON.stringify(e.details, null, 2)}
                      </Code>
                    ) : (
                      <Text size="xs" c="dark.4">—</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Container>
  )
}
