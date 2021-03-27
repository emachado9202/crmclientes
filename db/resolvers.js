const Usuario = require("../models/Usuario");
const Producto = require("../models/Producto");
const Cliente = require("../models/Cliente");
const Pedido = require("../models/Pedido");

const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");

const crearToken = (usuario, secret, expiresIn) => {
  console.log(usuario);

  const { id, nombre, apellido, email } = usuario;

  return jwt.sign({ id, nombre, apellido, email }, secret, { expiresIn });
};

const resolvers = {
  Query: {
    obtenerUsuario: async (_, {}, ctx) => {
      return ctx.usuario;
    },
    obtenerProductos: async () => {
      try {
        const productos = await Producto.find({});

        return productos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerProducto: async (_, { id }) => {
      const producto = await Producto.findById(id);
      if (!producto) {
        throw new Exception("No se encuentra el producto");
      }
      return producto;
    },
    obtenerClientes: async () => {
      try {
        const clientes = await Cliente.find({});

        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerClientesVendedor: async (_, {}, ctx) => {
      try {
        const clientes = await Cliente.find({
          vendedor: ctx.usuario.id.toString(),
        });

        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerCliente: async (_, { id }, ctx) => {
      const cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Exception("Cliente no encontrado");
      }
      if (cliente.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }
      return cliente;
    },
    obtenerPedidos: async () => {
      try {
        const pedidos = await Pedido.find({});

        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedidosVendedor: async (_, {}, ctx) => {
      try {
        const pedidos = await Pedido.find({
          vendedor: ctx.usuario.id,
        }).populate("cliente");
        console.log(pedidos);
        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedido: async (_, { id }, ctx) => {
      const pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Exception("Pedido no encontrado");
      }
      if (pedido.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }
      return pedido;
    },
    obtenerPedidosEstado: async (_, { estado }, ctx) => {
      const pedidos = await Pedido.find({ vendedor: ctx.usuario.id, estado });

      return pedidos;
    },
    mejoresClientes: async () => {
      const clientes = await Pedido.aggregate([
        { $match: { estado: "COMPLETADO" } },
        {
          $group: {
            _id: "$cliente",
            total: { $sum: "$total" },
          },
        },
        {
          $lookup: {
            from: "clientes",
            localField: "_id",
            foreignField: "_id",
            as: "cliente",
          },
        },
        {
          $sort: { total: -1 },
        },
        {
          $limit: 10,
        },
      ]);
      return clientes;
    },
    mejoresVendedores: async () => {
      const vendedores = await Pedido.aggregate([
        { $match: { estado: "COMPLETADO" } },
        {
          $group: {
            _id: "$vendedor",
            total: { $sum: "$total" },
          },
        },
        {
          $lookup: {
            from: "usuarios",
            localField: "_id",
            foreignField: "_id",
            as: "vendedor",
          },
        },
        {
          $sort: { total: -1 },
        },
        {
          $limit: 3,
        },
      ]);
      return vendedores;
    },
    buscarProducto: async (_, { texto }) => {
      const productos = await Producto.find({
        $text: { $search: texto },
      }).limit(10);

      return productos;
    },
  },
  Mutation: {
    nuevoUsuario: async (_, { input }) => {
      const { email, password } = input;

      const existeUsuario = await Usuario.findOne({ email });
      if (existeUsuario) {
        throw new Error("El usuario ya está registrado");
      }

      const salt = await bcryptjs.genSalt(10);
      input.password = await bcryptjs.hash(password, salt);

      try {
        const usuario = new Usuario(input);
        usuario.save();

        return usuario;
      } catch (error) {
        console.log(error);
      }
    },
    autenticarUsuario: async (_, { input }) => {
      const { email, password } = input;

      const existeUsuario = await Usuario.findOne({ email });
      if (!existeUsuario) {
        throw new Error("El usuario no está registrado");
      }

      const passwordCorrecto = await bcryptjs.compare(
        password,
        existeUsuario.password
      );

      if (!passwordCorrecto) {
        throw new Error("La contraseña es incorrecta");
      }

      return {
        token: crearToken(existeUsuario, process.env.SECRET, "24h"),
      };
    },
    nuevoProducto: async (_, { input }) => {
      try {
        const producto = new Producto(input);
        const result = await producto.save();

        return result;
      } catch (error) {
        console.log(error);
      }
    },
    actualizarProducto: async (_, { id, input }) => {
      let producto = await Producto.findById(id);
      if (!producto) {
        throw new Exception("No se encuentra el producto");
      }
      producto = await Producto.findByIdAndUpdate(id, input, { new: true });

      return producto;
    },
    eliminarProducto: async (_, { id }) => {
      let producto = await Producto.findById(id);
      if (!producto) {
        throw new Exception("No se encuentra el producto");
      }

      await Producto.findOneAndDelete({ _id: id });

      return "Producto eliminado";
    },
    nuevoCliente: async (_, { input }, ctx) => {
      const { email } = input;
      const cliente = await Cliente.findOne({ email });
      if (cliente) {
        throw new Error("Ese cliente ya está registrado");
      }

      try {
        const nuevoCliente = new Cliente(input);

        const { usuario } = ctx;
        nuevoCliente.vendedor = usuario.id;

        const resultado = await nuevoCliente.save();
        return resultado;
      } catch (error) {
        console.log(error);
      }
    },
    actualizarCliente: async (_, { id, input }, ctx) => {
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Exception("No se encuentra el cliente");
      }
      if (cliente.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }
      cliente = await Cliente.findByIdAndUpdate(id, input, { new: true });

      return cliente;
    },
    eliminarCliente: async (_, { id }, ctx) => {
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Exception("No se encuentra el cliente");
      }
      if (cliente.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }

      await Cliente.findOneAndDelete({ _id: id });

      return "Cliente eliminado";
    },
    nuevoPedido: async (_, { input }, ctx) => {
      let cliente = await Cliente.findById(input.cliente);
      if (!cliente) {
        throw new Exception("No se encuentra el cliente");
      }
      if (cliente.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }

      for await (const articulo of input.pedido) {
        const { id } = articulo;

        const producto = await Producto.findById(id);

        if (articulo.cantidad > producto.existencia) {
          throw new Error(
            `El articulo: ${producto.nombre} excede la cantidad disponible`
          );
        } else {
          producto.existencia -= articulo.cantidad;
          await producto.save();
        }
      }

      const pedido = new Pedido(input);
      pedido.vendedor = ctx.usuario.id;

      const resultado = await pedido.save();

      return resultado;
    },
    actualizarPedido: async (_, { id, input }, ctx) => {
      let pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Exception("No se encuentra el cliente");
      }
      if (pedido.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }

      if (input.pedido) {
        for await (const articulo of input.pedido) {
          const { id } = articulo;

          const producto = await Producto.findById(id);

          if (articulo.cantidad > producto.existencia) {
            throw new Error(
              `El articulo: ${producto.nombre} excede la cantidad disponible`
            );
          } else {
            producto.existencia -= articulo.cantidad;
            await producto.save();
          }
        }
      }

      pedido = await Pedido.findByIdAndUpdate(id, input, { new: true });

      return pedido;
    },
    eliminarPedido: async (_, { id }, ctx) => {
      let pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Exception("No se encuentra el cliente");
      }
      if (pedido.vendedor.toString() != ctx.usuario.id) {
        throw new Exception("No tiene las credenciales");
      }

      await Pedido.findOneAndDelete({ _id: id });

      return "Pedido eliminado";
    },
  },
};

module.exports = resolvers;
