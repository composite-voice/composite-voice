import { useState } from "react";
import {
  Table,
  TableCaption,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  Badge,
  Heading,
  Text,
  Alert,
  Code,
} from "composite-voice-ui";

const users = [
  { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "Admin", status: "Active" },
  { id: 2, name: "Bob Smith", email: "bob@example.com", role: "Editor", status: "Active" },
  { id: 3, name: "Carol Williams", email: "carol@example.com", role: "Viewer", status: "Inactive" },
  { id: 4, name: "David Brown", email: "david@example.com", role: "Editor", status: "Active" },
  { id: 5, name: "Eve Davis", email: "eve@example.com", role: "Admin", status: "Away" },
];

type SortColumn = "name" | "email" | "role" | "status" | null;
type SortDirection = "asc" | "desc";

function getStatusVariant(status: string) {
  switch (status) {
    case "Active":
      return "success" as const;
    case "Inactive":
      return "secondary" as const;
    case "Away":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function renderUserRows(data: typeof users) {
  return data.map((user) => (
    <TableRow key={user.id}>
      <TableCell>{user.name}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>{user.role}</TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(user.status)}>{user.status}</Badge>
      </TableCell>
    </TableRow>
  ));
}

function renderHeaderCells() {
  return (
    <>
      <TableHeaderCell scope="col">Name</TableHeaderCell>
      <TableHeaderCell scope="col">Email</TableHeaderCell>
      <TableHeaderCell scope="col">Role</TableHeaderCell>
      <TableHeaderCell scope="col">Status</TableHeaderCell>
    </>
  );
}

export default function TablesShowcase() {
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn].toLowerCase();
    const bVal = b[sortColumn].toLowerCase();
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-12">
      {/* Default Table */}
      <section>
        <Heading level={2}>Default Table</Heading>
        <Table>
          <TableCaption>List of registered users</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(users)}
          </TableBody>
        </Table>
      </section>

      {/* Striped Table */}
      <section>
        <Heading level={2}>Striped Table</Heading>
        <Table striped={true}>
          <TableCaption>Users displayed with alternating row colors</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(users)}
          </TableBody>
        </Table>
      </section>

      {/* Hoverable Table */}
      <section>
        <Heading level={2}>Hoverable Table</Heading>
        <Table hoverable={true}>
          <TableCaption>Users with hover highlight on rows</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(users)}
          </TableBody>
        </Table>
      </section>

      {/* Bordered Table */}
      <section>
        <Heading level={2}>Bordered Table</Heading>
        <Table bordered={true}>
          <TableCaption>Users displayed with visible cell borders</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(users)}
          </TableBody>
        </Table>
      </section>

      {/* Compact Table */}
      <section>
        <Heading level={2}>Compact Table</Heading>
        <Table compact={true}>
          <TableCaption>Users displayed with reduced padding</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(users)}
          </TableBody>
        </Table>
      </section>

      {/* Combined Variants */}
      <section>
        <Heading level={2}>Combined Variants</Heading>
        <Table striped={true} hoverable={true} bordered={true}>
          <TableCaption>Users with striped, hoverable, and bordered styles combined</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(users)}
          </TableBody>
        </Table>
      </section>

      {/* Sortable Headers */}
      <section>
        <Heading level={2}>Sortable Headers</Heading>
        <Table>
          <TableCaption>Click column headers to sort the table</TableCaption>
          <TableHead>
            <TableRow>
              <TableHeaderCell
                scope="col"
                sortable={true}
                sortDirection={sortColumn === "name" ? sortDirection : undefined}
                onSort={() => handleSort("name")}
              >
                Name
              </TableHeaderCell>
              <TableHeaderCell
                scope="col"
                sortable={true}
                sortDirection={sortColumn === "email" ? sortDirection : undefined}
                onSort={() => handleSort("email")}
              >
                Email
              </TableHeaderCell>
              <TableHeaderCell
                scope="col"
                sortable={true}
                sortDirection={sortColumn === "role" ? sortDirection : undefined}
                onSort={() => handleSort("role")}
              >
                Role
              </TableHeaderCell>
              <TableHeaderCell
                scope="col"
                sortable={true}
                sortDirection={sortColumn === "status" ? sortDirection : undefined}
                onSort={() => handleSort("status")}
              >
                Status
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {renderUserRows(sortedUsers)}
          </TableBody>
        </Table>
      </section>

      {/* Selected Row */}
      <section>
        <Heading level={2}>Selected Row</Heading>
        <Table>
          <TableCaption>Table with a visually selected row</TableCaption>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} selected={user.id === 2}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(user.status)}>{user.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Accessibility Notes */}
      <section>
        <Alert variant="info" title="Accessibility Notes">
          <Text>
            These table components use native HTML table semantics, ensuring full compatibility
            with screen readers and assistive technologies. Each header cell includes <Code>scope="col"</Code>{" "}
            to explicitly associate headers with their columns. The TableCaption component provides
            a programmatically associated description of the table's purpose. Schema.org Table
            itemType microdata is applied for enhanced structured data support. When tables overflow
            their container, a scrollable wrapper with <Code>role="region"</Code> and an accessible label ensures
            keyboard and screen reader users can navigate the content.
          </Text>
        </Alert>
      </section>
    </div>
  );
}
