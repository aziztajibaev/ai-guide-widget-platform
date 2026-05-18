"use client";

import Script from "next/script";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type DemoModule = "users" | "orders" | "inventory" | "reports";
type DemoModal = "user" | "order" | "stock" | null;

type DemoUser = {
  name: string;
  email: string;
  role: string;
  region: string;
  status: string;
};

type DemoOrder = {
  id: string;
  customer: string;
  product: string;
  owner: string;
  total: string;
  status: string;
};

type DemoProduct = {
  sku: string;
  name: string;
  category: string;
  stock: number;
  reorder: number;
  status: string;
};

const modules: Array<{ id: DemoModule; label: string; guide: string }> = [
  { id: "users", label: "Users", guide: "nav-users" },
  { id: "orders", label: "Sales orders", guide: "nav-orders" },
  { id: "inventory", label: "Inventory", guide: "nav-inventory" },
  { id: "reports", label: "Reports", guide: "nav-reports" }
];

const initialUsers: DemoUser[] = [
  { name: "Alan Lasseter", email: "alan@northstar.demo", role: "Manager", region: "Tashkent", status: "Active" },
  { name: "Ava Karimova", email: "ava@northstar.demo", role: "Admin", region: "Samarkand", status: "Active" },
  { name: "Bale Cristian", email: "bale@northstar.demo", role: "Merchandiser", region: "Tashkent", status: "Invited" },
  { name: "Dilafruz Saidova", email: "dilafruz@northstar.demo", role: "Operator", region: "Bukhara", status: "Active" },
  { name: "Firemaker Store", email: "store@northstar.demo", role: "User", region: "Fergana", status: "Paused" }
];

const initialOrders: DemoOrder[] = [
  { id: "SO-1048", customer: "Makro Market", product: "Sparkling water", owner: "Alan Lasseter", total: "$4,820", status: "Ready" },
  { id: "SO-1049", customer: "Family Shop", product: "Coffee mix", owner: "Ava Karimova", total: "$2,140", status: "Picking" },
  { id: "SO-1050", customer: "Bravo Retail", product: "Chocolate bar", owner: "Dilafruz Saidova", total: "$1,775", status: "Draft" }
];

const initialProducts: DemoProduct[] = [
  { sku: "SKU-2401", name: "Sparkling water", category: "Beverages", stock: 184, reorder: 80, status: "Healthy" },
  { sku: "SKU-8830", name: "Coffee mix", category: "Grocery", stock: 42, reorder: 60, status: "Low stock" },
  { sku: "SKU-3921", name: "Chocolate bar", category: "Snacks", stock: 318, reorder: 120, status: "Healthy" },
  { sku: "SKU-7642", name: "Paper cups", category: "Supplies", stock: 24, reorder: 50, status: "Low stock" }
];

const practiceTasks = [
  "Ask: How do I add a new user?",
  "Ask: Create a sales order",
  "Ask: Show low stock products",
  "Ask: Export the weekly report"
];

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export default function DemoPage() {
  const [activeModule, setActiveModule] = useState<DemoModule>("users");
  const [activeModal, setActiveModal] = useState<DemoModal>(null);
  const [users, setUsers] = useState(initialUsers);
  const [orders, setOrders] = useState(initialOrders);
  const [products, setProducts] = useState(initialProducts);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [orderStatus, setOrderStatus] = useState("All statuses");
  const [inventoryMode, setInventoryMode] = useState("All products");

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !query || `${user.name} ${user.email} ${user.region}`.toLowerCase().includes(query);
      const matchesRole = roleFilter === "All roles" || user.role === roleFilter;
      const matchesStatus = statusFilter === "All statuses" || user.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [roleFilter, statusFilter, userSearch, users]);

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => orderStatus === "All statuses" || order.status === orderStatus);
  }, [orderStatus, orders]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => inventoryMode === "All products" || product.status === "Low stock");
  }, [inventoryMode, products]);

  function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = formValue(data, "name") || "New teammate";
    setUsers((current) => [
      {
        name,
        email: formValue(data, "email") || `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@northstar.demo`,
        role: formValue(data, "role") || "User",
        region: formValue(data, "region") || "Tashkent",
        status: "Invited"
      },
      ...current
    ]);
    setActiveModal(null);
  }

  function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextNumber = 1051 + orders.length;
    setOrders((current) => [
      {
        id: `SO-${nextNumber}`,
        customer: formValue(data, "customer") || "New customer",
        product: formValue(data, "product") || "Sparkling water",
        owner: formValue(data, "owner") || "Alan Lasseter",
        total: "$1,260",
        status: "Draft"
      },
      ...current
    ]);
    setActiveModal(null);
  }

  function saveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sku = formValue(data, "sku") || "SKU-8830";
    const quantity = Number(formValue(data, "quantity") || "120");
    setProducts((current) =>
      current.map((product) =>
        product.sku === sku
          ? {
              ...product,
              stock: product.stock + quantity,
              status: product.stock + quantity <= product.reorder ? "Low stock" : "Healthy"
            }
          : product
      )
    );
    setActiveModal(null);
  }

  return (
    <main className="shell demo-workspace">
      <header className="demo-topbar">
        <div className="demo-brand">
          <span className="brand-mark" />
          <div>
            <strong>Northstar Retail</strong>
            <span>Demo project</span>
          </div>
        </div>
        <nav aria-label="Demo project modules" className="demo-nav">
          {modules.map((module) => (
            <button
              className={activeModule === module.id ? "active" : ""}
              data-guide={module.guide}
              key={module.id}
              onClick={() => setActiveModule(module.id)}
              type="button"
            >
              {module.label}
            </button>
          ))}
        </nav>
        <div className="demo-user-chip" data-guide="account-menu">
          AT
        </div>
      </header>

      <section className="demo-hero">
        <div className="demo-hero-copy">
          <h1>Practice guided work inside a real demo project.</h1>
          <p>
            Use the Smartup Guide widget on this page to add users, create orders, manage inventory, and export reports.
          </p>
          <div className="demo-status-row" aria-label="Demo workspace summary">
            <span>{users.length} users</span>
            <span>{orders.length} orders</span>
            <span>{products.filter((product) => product.status === "Low stock").length} low-stock items</span>
          </div>
        </div>
        <aside className="demo-practice-panel">
          <strong>Try these assistant requests</strong>
          {practiceTasks.map((task) => (
            <span key={task}>{task}</span>
          ))}
        </aside>
      </section>

      <section className="demo-shell-grid">
        <aside className="demo-side-rail">
          <span>Workspace</span>
          {modules.map((module) => (
            <button
              className={activeModule === module.id ? "active" : ""}
              data-guide={`side-${module.guide}`}
              key={module.id}
              onClick={() => setActiveModule(module.id)}
              type="button"
            >
              {module.label}
            </button>
          ))}
        </aside>

        <section className="demo-main-panel">
          {activeModule === "users" ? (
            <section className="demo-module">
              <div className="demo-module-header">
                <div>
                  <h2>User management</h2>
                  <p>Create teammates, filter roles, and check access status.</p>
                </div>
                <button className="btn primary" data-guide="create-user" onClick={() => setActiveModal("user")} type="button">
                  Create user
                </button>
              </div>
              <div className="demo-filters">
                <input
                  aria-label="Search users"
                  data-guide="search-users"
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search users..."
                  value={userSearch}
                />
                <select aria-label="Role filter" data-guide="role-filter" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
                  <option>All roles</option>
                  <option>Admin</option>
                  <option>Manager</option>
                  <option>Merchandiser</option>
                  <option>Operator</option>
                  <option>User</option>
                </select>
                <select
                  aria-label="Status filter"
                  data-guide="status-filter"
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option>All statuses</option>
                  <option>Active</option>
                  <option>Invited</option>
                  <option>Paused</option>
                </select>
              </div>
              <div className="demo-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Region</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.email}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>{user.region}</td>
                        <td>
                          <span className={`demo-state ${user.status === "Active" ? "success" : user.status === "Paused" ? "warning" : ""}`}>
                            {user.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeModule === "orders" ? (
            <section className="demo-module">
              <div className="demo-module-header">
                <div>
                  <h2>Sales orders</h2>
                  <p>Build a customer order and move it from draft to fulfillment.</p>
                </div>
                <button className="btn primary" data-guide="create-order" onClick={() => setActiveModal("order")} type="button">
                  Create order
                </button>
              </div>
              <div className="demo-filters">
                <select
                  aria-label="Order status filter"
                  data-guide="order-status-filter"
                  onChange={(event) => setOrderStatus(event.target.value)}
                  value={orderStatus}
                >
                  <option>All statuses</option>
                  <option>Draft</option>
                  <option>Picking</option>
                  <option>Ready</option>
                </select>
              </div>
              <div className="demo-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Owner</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.id}</td>
                        <td>{order.customer}</td>
                        <td>{order.product}</td>
                        <td>{order.owner}</td>
                        <td>{order.total}</td>
                        <td>
                          <span className={`demo-state ${order.status === "Ready" ? "success" : ""}`}>{order.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeModule === "inventory" ? (
            <section className="demo-module">
              <div className="demo-module-header">
                <div>
                  <h2>Inventory control</h2>
                  <p>Find low stock items and submit restock updates.</p>
                </div>
                <button className="btn primary" data-guide="restock-product" onClick={() => setActiveModal("stock")} type="button">
                  Restock product
                </button>
              </div>
              <div className="demo-filters">
                <button
                  className={inventoryMode === "All products" ? "btn primary" : "btn"}
                  data-guide="all-products"
                  onClick={() => setInventoryMode("All products")}
                  type="button"
                >
                  All products
                </button>
                <button
                  className={inventoryMode === "Low stock" ? "btn primary" : "btn"}
                  data-guide="low-stock-filter"
                  onClick={() => setInventoryMode("Low stock")}
                  type="button"
                >
                  Low stock
                </button>
              </div>
              <div className="demo-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Stock</th>
                      <th>Reorder point</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => (
                      <tr key={product.sku}>
                        <td>{product.sku}</td>
                        <td>{product.name}</td>
                        <td>{product.category}</td>
                        <td>{product.stock}</td>
                        <td>{product.reorder}</td>
                        <td>
                          <span className={`demo-state ${product.status === "Healthy" ? "success" : "warning"}`}>{product.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeModule === "reports" ? (
            <section className="demo-module">
              <div className="demo-module-header">
                <div>
                  <h2>Reports</h2>
                  <p>Review operating metrics and export the weekly report.</p>
                </div>
                <button className="btn primary" data-guide="export-report" type="button">
                  Export report
                </button>
              </div>
              <div className="demo-report-grid">
                <article>
                  <span>Revenue</span>
                  <strong>$42.8k</strong>
                  <small>+12% this week</small>
                </article>
                <article>
                  <span>Orders ready</span>
                  <strong>{orders.filter((order) => order.status === "Ready").length}</strong>
                  <small>Fulfillment queue</small>
                </article>
                <article>
                  <span>Low stock</span>
                  <strong>{products.filter((product) => product.status === "Low stock").length}</strong>
                  <small>Needs attention</small>
                </article>
              </div>
            </section>
          ) : null}
        </section>
      </section>

      {activeModal === "user" ? (
        <div className="modal-backdrop">
          <form className="modal demo-modal" onSubmit={saveUser}>
            <h2>Create user</h2>
            <div className="field">
              <label>Full name</label>
              <input data-guide="user-name" name="name" placeholder="Enter full name" />
            </div>
            <div className="field">
              <label>Email</label>
              <input data-guide="user-email" name="email" placeholder="name@northstar.demo" type="email" />
            </div>
            <div className="grid two compact-grid">
              <div className="field">
                <label>Role</label>
                <select data-guide="user-role" name="role">
                  <option>User</option>
                  <option>Admin</option>
                  <option>Manager</option>
                  <option>Merchandiser</option>
                  <option>Operator</option>
                </select>
              </div>
              <div className="field">
                <label>Region</label>
                <select data-guide="user-region" name="region">
                  <option>Tashkent</option>
                  <option>Samarkand</option>
                  <option>Bukhara</option>
                  <option>Fergana</option>
                </select>
              </div>
            </div>
            <div className="actions">
              <button className="btn primary" data-guide="save-user" type="submit">
                Save user
              </button>
              <button className="btn" onClick={() => setActiveModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activeModal === "order" ? (
        <div className="modal-backdrop">
          <form className="modal demo-modal" onSubmit={saveOrder}>
            <h2>Create order</h2>
            <div className="field">
              <label>Customer</label>
              <input data-guide="order-customer" name="customer" placeholder="Customer name" />
            </div>
            <div className="field">
              <label>Product</label>
              <select data-guide="order-product" name="product">
                {products.map((product) => (
                  <option key={product.sku}>{product.name}</option>
                ))}
              </select>
            </div>
            <div className="grid two compact-grid">
              <div className="field">
                <label>Quantity</label>
                <input data-guide="order-quantity" min="1" name="quantity" placeholder="120" type="number" />
              </div>
              <div className="field">
                <label>Owner</label>
                <select data-guide="order-owner" name="owner">
                  {users.slice(0, 4).map((user) => (
                    <option key={user.email}>{user.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="actions">
              <button className="btn primary" data-guide="save-order" type="submit">
                Save order
              </button>
              <button className="btn" onClick={() => setActiveModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activeModal === "stock" ? (
        <div className="modal-backdrop">
          <form className="modal demo-modal" onSubmit={saveStock}>
            <h2>Restock product</h2>
            <div className="field">
              <label>Product SKU</label>
              <select data-guide="stock-sku" name="sku">
                {products.map((product) => (
                  <option key={product.sku} value={product.sku}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Quantity to add</label>
              <input data-guide="stock-quantity" min="1" name="quantity" placeholder="120" type="number" />
            </div>
            <div className="actions">
              <button className="btn primary" data-guide="save-stock" type="submit">
                Save stock update
              </button>
              <button className="btn" onClick={() => setActiveModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <Script id="demo-widget-defaults" strategy="afterInteractive">
        {`
          try {
            localStorage.setItem("ai-guide-widget:demo-project:docked", "1");
            localStorage.removeItem("ai-guide-widget:demo-project:position");
          } catch (error) {}
        `}
      </Script>
      <Script src="/widget/loader.js" data-project-id="demo-project" strategy="afterInteractive" />
    </main>
  );
}
